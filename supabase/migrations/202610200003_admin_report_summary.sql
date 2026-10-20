-- Exact report totals without first-page truncation in the dashboard API.
alter table public.projects
  add column if not exists project_type text not null default 'website';
do $$ begin
  alter table public.projects add constraint projects_project_type_check
    check (project_type in ('website', 'app', 'video'));
exception when duplicate_object then null;
end $$;
update public.projects set project_type = case when template_id = 'empty' then 'app' else 'website' end;

create or replace function public.create_workspace_project(
  p_project jsonb,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_name text;
  v_template text;
  v_language text;
  v_type text;
  v_project_cap integer;
  v_owned_count bigint;
begin
  if p_project is null or jsonb_typeof(p_project) is distinct from 'object'
     or p_actor is null then
    raise exception 'invalid_project';
  end if;
  if (p_project ->> 'owner_id')::uuid is distinct from p_actor
     or coalesce(p_project ->> 'status', '') <> 'draft' then
    raise exception 'not_authorized';
  end if;
  if p_project ? 'workspace_id' and p_project ->> 'workspace_id' is not null then
    raise exception 'invalid_project';
  end if;

  v_name := btrim(coalesce(p_project ->> 'name', ''));
  if char_length(v_name) not between 1 and 160 then raise exception 'invalid_project_name'; end if;
  v_project_id := (p_project ->> 'id')::uuid;
  v_template := nullif(p_project ->> 'template_id', '');
  v_language := nullif(p_project ->> 'programming_language', '');
  v_type := coalesce(nullif(p_project ->> 'project_type', ''), 'website');
  if (v_template is null) <> (v_language is null) then raise exception 'invalid_project_template'; end if;
  if v_type not in ('website', 'app', 'video') then raise exception 'invalid_project_type'; end if;

  perform 1 from auth.users u
  where u.id = p_actor and u.email_confirmed_at is not null
  for update;
  if not found then raise exception 'not_authorized'; end if;

  select pl.project_cap into v_project_cap
  from public.plan_entitlements ent
  join public.subscription_plans pl on pl.id = ent.plan_id
  where ent.user_id = p_actor and ent.workspace_id is null and ent.active
    and ent.starts_at <= now() and (ent.ends_at is null or ent.ends_at > now())
  order by ent.starts_at desc
  limit 1;

  if v_project_cap is not null then
    select count(*) into v_owned_count
    from public.projects p where p.owner_id = p_actor and p.status <> 'archived';
    if v_owned_count >= v_project_cap then raise exception 'project_cap_reached'; end if;
  end if;

  insert into public.projects(
    id, owner_id, workspace_id, name, status, template_id, programming_language, project_type
  ) values (
    v_project_id, p_actor, null, v_name, 'draft', v_template, v_language, v_type
  );
  insert into public.audit_events(actor_id, project_id, action, metadata)
    values (p_actor, v_project_id, 'project.created', jsonb_build_object('name', v_name, 'template_id', v_template, 'programming_language', v_language, 'project_type', v_type));
  return v_project_id;
end;
$$;
revoke all on function public.create_workspace_project(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_workspace_project(jsonb, uuid) to service_role;

create or replace function public.admin_report_summary(p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since date;
  v_users bigint;
  v_active_projects bigint;
  v_tokens bigint;
  v_creation jsonb;
begin
  if p_days not in (7, 30, 90) then raise exception 'invalid_report_range'; end if;
  v_since := (now() at time zone 'UTC')::date - (p_days - 1);

  select count(*) into v_users from public.profiles;
  select count(*) into v_active_projects from public.projects where status <> 'archived';
  select coalesce(sum(input_tokens + output_tokens), 0) into v_tokens
    from public.usage_events where created_at >= (now() - make_interval(days => p_days));

  with days as (
    select generate_series(v_since, (now() at time zone 'UTC')::date, interval '1 day')::date as day
  ), counts as (
    select (p.created_at at time zone 'UTC')::date as day,
      count(*) filter (where p.project_type = 'website') as websites,
      count(*) filter (where p.project_type = 'app') as apps,
      count(*) filter (where p.project_type = 'video') as videos
    from public.projects p
    where p.created_at >= (v_since::timestamp at time zone 'UTC')
      and p.created_at < ((now() at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC'
    group by (p.created_at at time zone 'UTC')::date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.day,
    'website', coalesce(counts.websites, 0),
    'app', coalesce(counts.apps, 0),
    'video', coalesce(counts.videos, 0)
  ) order by days.day), '[]'::jsonb)
  into v_creation
  from days left join counts using (day);

  return jsonb_build_object(
    'users', v_users,
    'activeProjects', v_active_projects,
    'tokensUsed', v_tokens,
    'creationActivity', v_creation
  );
end;
$$;
revoke all on function public.admin_report_summary(integer) from public, anon, authenticated;
grant execute on function public.admin_report_summary(integer) to service_role;
