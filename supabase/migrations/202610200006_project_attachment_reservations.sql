create table public.project_attachments (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  ordinal integer not null check (ordinal between 0 and 4),
  name text not null check (char_length(name) between 1 and 200),
  storage_path text not null unique,
  size bigint not null check (size between 1 and 8388608),
  content_type text not null check (content_type in (
    'application/json','application/pdf','image/gif','image/jpeg','image/png',
    'image/webp','text/csv','text/markdown','text/plain','video/mp4',
    'video/quicktime','video/webm'
  )),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now(),
  unique (project_id, request_id, ordinal),
  unique (project_id, id),
  constraint project_attachments_path_prefix check (
    storage_path ~ ('^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}-[A-Za-z0-9._-]{1,120}$')
  )
);
create index project_attachments_project_status_idx
  on public.project_attachments(project_id, status, created_at desc);
alter table public.project_attachments enable row level security;
revoke all on public.project_attachments from public, anon, authenticated;
grant all on public.project_attachments to service_role;

create or replace function public.reserve_project_attachments(
  p_project uuid,
  p_actor uuid,
  p_request uuid,
  p_files jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_file jsonb;
  v_existing jsonb;
  v_incoming jsonb;
  v_count integer;
  v_total bigint;
  v_legacy_count bigint;
  v_pending_at timestamptz;
  v_created boolean := true;
begin
  if p_project is null or p_actor is null or p_request is null
     or p_files is null or jsonb_typeof(p_files) is distinct from 'array'
     or jsonb_array_length(p_files) not between 1 and 5 then
    raise exception 'invalid_attachment_manifest';
  end if;
  select * into v_project from public.projects where id = p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if v_project.status = 'archived' then raise exception 'project_archived'; end if;
  if not exists (
    select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null
  ) or not (
    v_project.owner_id = p_actor
    or (v_project.workspace_id is not null and exists (
      select 1 from public.memberships m
      where m.workspace_id = v_project.workspace_id and m.user_id = p_actor
    ))
  ) then raise exception 'not_authorized'; end if;

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    if jsonb_typeof(v_file) is distinct from 'object'
       or coalesce(v_file ->> 'id', '') !~ '^[a-f0-9-]{36}$'
       or coalesce(v_file ->> 'ordinal', '') !~ '^[0-4]$'
       or coalesce(v_file ->> 'name', '') = ''
       or char_length(v_file ->> 'name') > 200
       or (v_file ->> 'name') ~ '[[:cntrl:]]'
       or coalesce(v_file ->> 'storage_path', '') <> v_project.owner_id::text || '/' || p_project::text || '/' || (v_file ->> 'id') || '-' || regexp_replace(
            regexp_replace(normalize(v_file ->> 'name', NFKC), '[^a-zA-Z0-9._-]+', '-', 'g'),
            '^\.+', '', 'g'
          )
       or (v_file ->> 'storage_path') !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}-[A-Za-z0-9._-]{1,120}$'
       or coalesce(v_file ->> 'size', '') !~ '^[1-9][0-9]*$'
       or (v_file ->> 'size')::bigint > 8388608
       or coalesce(v_file ->> 'content_type', '') not in (
         'application/json','application/pdf','image/gif','image/jpeg','image/png',
         'image/webp','text/csv','text/markdown','text/plain','video/mp4',
         'video/quicktime','video/webm'
       )
       or coalesce(v_file ->> 'sha256', '') !~ '^[a-f0-9]{64}$' then
      raise exception 'invalid_attachment_manifest';
    end if;
  end loop;
  if (select count(distinct value ->> 'ordinal') from jsonb_array_elements(p_files)) <> jsonb_array_length(p_files)
     or (select count(distinct value ->> 'id') from jsonb_array_elements(p_files)) <> jsonb_array_length(p_files) then
    raise exception 'invalid_attachment_manifest';
  end if;
  select sum((value ->> 'size')::bigint) into v_total from jsonb_array_elements(p_files);
  if v_total > 20971520 then raise exception 'attachment_size_limit'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'ordinal', a.ordinal, 'name', a.name,
      'storage_path', a.storage_path, 'size', a.size,
      'content_type', a.content_type, 'sha256', a.sha256
    ) order by a.ordinal), '[]'::jsonb), min(a.created_at)
    into v_existing, v_pending_at
    from public.project_attachments a
    where a.project_id = p_project and a.request_id = p_request;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', value ->> 'id', 'ordinal', (value ->> 'ordinal')::integer,
      'name', value ->> 'name', 'storage_path', value ->> 'storage_path',
      'size', (value ->> 'size')::bigint, 'content_type', value ->> 'content_type',
      'sha256', value ->> 'sha256'
    ) order by (value ->> 'ordinal')::integer), '[]'::jsonb)
    into v_incoming from jsonb_array_elements(p_files);

  if v_existing <> '[]'::jsonb then
    if v_existing <> v_incoming then raise exception 'idempotency_conflict'; end if;
    if exists (select 1 from public.project_attachments a where a.project_id = p_project and a.request_id = p_request and a.status = 'ready') then
      if exists (select 1 from public.project_attachments a where a.project_id = p_project and a.request_id = p_request and a.status <> 'ready') then
        raise exception 'attachment_pending';
      end if;
      v_created := false;
    elsif v_pending_at > now() - interval '10 minutes' then
      raise exception 'attachment_pending';
    else
      update public.project_attachments set created_at = now()
        where project_id = p_project and request_id = p_request and status = 'pending';
    end if;
  else
    select count(*) into v_count from public.project_attachments a where a.project_id = p_project;
    select count(*) into v_legacy_count from storage.objects o
      where o.bucket_id = 'project-attachments'
        and o.name like v_project.owner_id::text || '/' || p_project::text || '/%'
        and not exists (
          select 1 from public.project_attachments a
          where a.project_id = p_project and a.storage_path = o.name
        );
    if v_count + v_legacy_count + jsonb_array_length(p_files) > 100 then
      raise exception 'attachment_limit';
    end if;
    insert into public.project_attachments(
      id, project_id, actor_id, request_id, ordinal, name, storage_path,
      size, content_type, sha256, status
    )
    select (value ->> 'id')::uuid, p_project, p_actor, p_request,
      (value ->> 'ordinal')::integer, value ->> 'name', value ->> 'storage_path',
      (value ->> 'size')::bigint, value ->> 'content_type', value ->> 'sha256', 'pending'
    from jsonb_array_elements(p_files);
  end if;

  return jsonb_build_object(
    'created', v_created,
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.ordinal)
      from public.project_attachments a
      where a.project_id = p_project and a.request_id = p_request
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.reserve_project_attachments(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_project_attachments(uuid, uuid, uuid, jsonb)
  to service_role;

create or replace function public.finish_project_attachments(
  p_project uuid,
  p_actor uuid,
  p_request uuid,
  p_ready boolean
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_count integer;
  v_objects integer;
begin
  if p_project is null or p_actor is null or p_request is null or p_ready is null then
    raise exception 'invalid_attachment_manifest';
  end if;
  select * into v_project from public.projects where id = p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if v_project.status = 'archived' then raise exception 'project_archived'; end if;
  if not exists (
    select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null
  ) or not (
    v_project.owner_id = p_actor
    or (v_project.workspace_id is not null and exists (
      select 1 from public.memberships m
      where m.workspace_id = v_project.workspace_id and m.user_id = p_actor
    ))
  ) then raise exception 'not_authorized'; end if;
  select count(*) into v_count from public.project_attachments a
    where a.project_id = p_project and a.request_id = p_request and a.status = 'pending';
  if v_count = 0 then return 0; end if;
  if p_ready then
    select count(*) into v_objects from public.project_attachments a
      join storage.objects o on o.bucket_id = 'project-attachments' and o.name = a.storage_path
      where a.project_id = p_project and a.request_id = p_request and a.status = 'pending';
    if v_objects <> v_count then raise exception 'attachment_objects_missing'; end if;
    update public.project_attachments set status = 'ready'
      where project_id = p_project and request_id = p_request and status = 'pending';
    insert into public.audit_events(actor_id, project_id, action, metadata)
      values (p_actor, p_project, 'attachment.uploaded', jsonb_build_object('request_id', p_request, 'file_count', v_count));
  else
    delete from public.project_attachments
      where project_id = p_project and request_id = p_request and status = 'pending';
  end if;
  return v_count;
end;
$$;
revoke all on function public.finish_project_attachments(uuid, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_project_attachments(uuid, uuid, uuid, boolean)
  to service_role;
