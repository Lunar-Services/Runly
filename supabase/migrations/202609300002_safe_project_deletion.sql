-- Keep usage and AI audit history after a project is removed.
alter table public.projects add column deletion_requested_at timestamptz;
alter table public.usage_reservations alter column project_id drop not null;
alter table public.usage_reservations drop constraint usage_reservations_project_id_fkey;
alter table public.usage_reservations add constraint usage_reservations_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;
alter table public.usage_events alter column project_id drop not null;
alter table public.usage_events drop constraint usage_events_project_id_fkey;
alter table public.usage_events add constraint usage_events_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;
alter table public.ai_request_logs alter column project_id drop not null;
alter table public.ai_request_logs drop constraint ai_request_logs_project_id_fkey;
alter table public.ai_request_logs add constraint ai_request_logs_project_id_fkey
  foreign key (project_id) references public.projects(id) on delete set null;

-- Admission locks the same project row, so once archived no new agent or
-- start job can race with shutdown and deletion.
create function public.mark_project_deleting(p_project uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects;
begin
  select * into p from public.projects where id=p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if p.owner_id<>p_actor then raise exception 'not_authorized'; end if;
  update public.projects set status='archived',deletion_requested_at=coalesce(deletion_requested_at,now()),updated_at=now() where id=p_project;
end $$;

create function public.finish_project_deletion(p_project uuid,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; runtime public.project_runtimes;
begin
  select * into p from public.projects where id=p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if p.owner_id<>p_actor then raise exception 'not_authorized'; end if;
  if p.deletion_requested_at is null then raise exception 'project_not_marked'; end if;
  if exists(select 1 from public.runtime_jobs where project_id=p_project and state in ('queued','running')) then raise exception 'jobs_active'; end if;
  if exists(select 1 from public.runtime_jobs where project_id=p_project and provider_submitted and usage is null) then raise exception 'usage_unreconciled'; end if;
  select * into runtime from public.project_runtimes where project_id=p_project for update;
  if found and (runtime.state<>'stopped' or runtime.session_id is not null) then raise exception 'sandbox_active'; end if;
  update public.usage_reservations set status='released' where project_id=p_project and status='reserved';
  delete from public.projects where id=p_project;
end $$;

revoke all on function public.mark_project_deleting(uuid,uuid),public.finish_project_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mark_project_deleting(uuid,uuid),public.finish_project_deletion(uuid,uuid) to service_role;
