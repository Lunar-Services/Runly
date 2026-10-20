-- Durable workspace history, publish links, and operator audit events.
-- Runtime state and file contents remain service-owned.

alter table public.project_versions
  alter column encrypted_manifest drop not null,
  add column if not exists description text,
  add column if not exists files jsonb not null default '[]'::jsonb;

alter table public.project_versions
  add constraint project_versions_files_array_check
  check (jsonb_typeof(files) = 'array'),
  add constraint project_versions_description_length_check
  check (description is null or char_length(description) <= 500),
  add constraint project_versions_id_project_unique
  unique (id, project_id);

-- User-facing snapshots are immutable and may only be written by trusted server
-- routes. Existing authenticated reads continue to follow project access RLS.
revoke insert, update, delete on public.project_versions from authenticated;
grant select on public.project_versions to authenticated;
grant all on public.project_versions to service_role;

-- All project mutations, chat writes, and snapshot writes pass through
-- authenticated server routes using the service role. In particular, direct
-- PostgREST DELETE must not bypass the archive workflow and cascade ledgers.
revoke insert, update, delete on public.projects from authenticated;
grant select on public.projects to authenticated;
revoke insert, update, delete on public.project_drafts, public.conversations, public.messages from authenticated;
grant select on public.project_drafts, public.conversations, public.messages to authenticated;

create table public.project_shares (
  project_id uuid primary key references public.projects(id) on delete cascade,
  version_id uuid,
  token text not null unique default rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '='),
  enabled boolean not null default false,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_shares_token_check check (token ~ '^[A-Za-z0-9_-]{43}$'),
  constraint project_shares_version_project_fkey
    foreign key (version_id, project_id)
    references public.project_versions(id, project_id)
    on delete set null (version_id)
);

alter table public.project_shares enable row level security;
revoke all on public.project_shares from public, anon, authenticated;
grant select on public.project_shares to authenticated;
grant all on public.project_shares to service_role;
create policy project_shares_owner_select on public.project_shares
  for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_shares.project_id and p.owner_id = (select auth.uid())
  ));

create trigger project_shares_touch_updated_at
  before update on public.project_shares
  for each row execute function private.touch_updated_at();
create or replace function private.rotate_project_share_on_enable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled) then
    new.token := rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
    new.expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;
revoke all on function private.rotate_project_share_on_enable() from public, anon, authenticated;
create trigger project_shares_rotate_on_enable
  before insert or update on public.project_shares
  for each row execute function private.rotate_project_share_on_enable();

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_events_actor_created_idx on public.audit_events(actor_id, created_at desc);
create index audit_events_project_created_idx on public.audit_events(project_id, created_at desc);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public, anon, authenticated;
grant all on public.audit_events to service_role;

-- Durable admin configuration and daemon registration inventory. Credentials
-- are represented only by a one-way digest; callers never persist bearer tokens.
create table public.swiftlet_settings (
  id boolean primary key default true check (id),
  endpoint text not null default '' check (char_length(endpoint) <= 2048),
  scheduling text not null default 'least-occupied'
    check (scheduling in ('least-occupied', 'round-robin', 'available-memory')),
  max_eggs integer not null default 8 check (max_eggs between 1 and 500),
  idle_minutes integer not null default 30 check (idle_minutes between 1 and 1440),
  heartbeat_seconds integer not null default 90 check (heartbeat_seconds between 10 and 600),
  provisioning_seconds integer not null default 180 check (provisioning_seconds between 30 and 3600),
  encrypted_api_token text,
  token_set_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table public.admin_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_range integer not null default 30,
  updated_at timestamptz not null default now(),
  constraint admin_preferences_default_range_check check (default_range in (7, 30, 90))
);
insert into public.swiftlet_settings(id) values (true) on conflict (id) do nothing;
alter table public.admin_preferences enable row level security;
alter table public.swiftlet_settings enable row level security;
revoke all on public.swiftlet_settings from public, anon, authenticated;
revoke all on public.admin_preferences from public, anon, authenticated;
grant all on public.swiftlet_settings to service_role;
grant all on public.admin_preferences to service_role;

alter table public.profiles
  add column theme text not null default 'light'
  check (theme in ('light', 'dark', 'system'));

create table public.nests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  endpoint text not null check (char_length(endpoint) between 1 and 2048),
  country_code text not null default '' check (country_code = '' or country_code ~ '^[A-Z]{2}$'),
  max_eggs integer not null check (max_eggs between 1 and 500),
  status text not null default 'pending' check (status in ('online', 'draining', 'offline', 'pending')),
  active_eggs integer check (active_eggs between 0 and 500),
  cpu_percent numeric(5,2) check (cpu_percent between 0 and 100),
  ram_percent numeric(5,2) check (ram_percent between 0 and 100),
  credential_hash text unique check (credential_hash is null or credential_hash ~ '^[0-9a-f]{64}$'),
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint nests_capacity_check check (active_eggs is null or max_eggs >= active_eggs),
  constraint nests_unique_endpoint unique (endpoint)
);
create index nests_status_idx on public.nests(status, country_code);
create unique index nests_unique_name_idx on public.nests(lower(name));
alter table public.nests enable row level security;
revoke all on public.nests from public, anon, authenticated;
grant all on public.nests to service_role;
create trigger swiftlet_settings_touch_updated_at
  before update on public.swiftlet_settings
  for each row execute function private.touch_updated_at();
create trigger admin_preferences_touch_updated_at
  before update on public.admin_preferences
  for each row execute function private.touch_updated_at();
create trigger nests_touch_updated_at
  before update on public.nests
  for each row execute function private.touch_updated_at();

create or replace function private.audit_admin_configuration_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_action text;
  v_metadata jsonb;
  v_row jsonb;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_actor := coalesce(
    nullif(v_row ->> 'updated_by', '')::uuid,
    nullif(v_row ->> 'created_by', '')::uuid,
    nullif(v_row ->> 'user_id', '')::uuid
  );
  if tg_table_name = 'swiftlet_settings' then
    v_action := 'admin.swiftlet_settings.updated';
    v_metadata := jsonb_build_object(
      'endpoint', v_row ->> 'endpoint',
      'scheduling', v_row ->> 'scheduling',
      'max_eggs', (v_row ->> 'max_eggs')::integer,
      'idle_minutes', (v_row ->> 'idle_minutes')::integer,
      'heartbeat_seconds', (v_row ->> 'heartbeat_seconds')::integer,
      'provisioning_seconds', (v_row ->> 'provisioning_seconds')::integer,
      'token_configured', v_row ->> 'encrypted_api_token' is not null,
      'token_set_at', v_row ->> 'token_set_at'
    );
  elsif tg_table_name = 'nests' then
    v_action := case when tg_op = 'INSERT' then 'admin.nest.created' when tg_op = 'DELETE' then 'admin.nest.deleted' else 'admin.nest.updated' end;
    v_metadata := jsonb_build_object(
      'nest_id', v_row ->> 'id',
      'name', v_row ->> 'name',
      'endpoint', v_row ->> 'endpoint',
      'country_code', v_row ->> 'country_code',
      'max_eggs', (v_row ->> 'max_eggs')::integer,
      'status', v_row ->> 'status',
      'credential_configured', v_row ->> 'credential_hash' is not null
    );
  elsif tg_table_name = 'admin_preferences' then
    v_action := case when tg_op = 'DELETE' then 'admin.preferences.deleted' else 'admin.preferences.updated' end;
    v_metadata := jsonb_build_object('default_range', (v_row ->> 'default_range')::integer);
  end if;

  insert into public.audit_events(actor_id, action, metadata)
    values (v_actor, v_action, v_metadata);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.audit_admin_configuration_change() from public, anon, authenticated;
create trigger swiftlet_settings_audit
  after insert or update on public.swiftlet_settings
  for each row execute function private.audit_admin_configuration_change();
create trigger nests_audit
  after insert or update on public.nests
  for each row execute function private.audit_admin_configuration_change();
create trigger admin_preferences_audit
  after insert or update or delete on public.admin_preferences
  for each row execute function private.audit_admin_configuration_change();

create or replace function private.audit_profile_preference_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.theme is distinct from old.theme then
    insert into public.audit_events(actor_id, action, metadata)
      values (new.id, 'account.theme_updated', jsonb_build_object('theme', new.theme));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_profile_preference_change() from public, anon, authenticated;
create trigger profiles_preference_audit
  after update on public.profiles
  for each row execute function private.audit_profile_preference_change();

-- Owner-scoped metadata changes are checked again in the database even though
-- application routes also authenticate the caller.
create or replace function public.mutate_project(
  p_project uuid,
  p_actor uuid,
  p_name text default null,
  p_status text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_name text;
begin
  if p_project is null or p_actor is null
     or (p_name is null and p_status is null)
     or (p_status is not null and p_status not in ('draft', 'active', 'archived')) then
    raise exception 'invalid_project_update';
  end if;
  if p_name is not null then
    v_name := btrim(p_name);
    if char_length(v_name) not between 1 and 160 then raise exception 'invalid_project_name'; end if;
  end if;

  select * into v_project from public.projects where id = p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if v_project.status = 'archived' then raise exception 'project_archived'; end if;
  if v_project.owner_id <> p_actor or not exists (
    select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null
  ) then raise exception 'not_authorized'; end if;

  if p_status = 'archived' and (
    exists (select 1 from public.project_runtimes r where r.project_id = p_project and r.state not in ('stopped', 'error'))
    or exists (select 1 from public.runtime_jobs j where j.project_id = p_project and j.state in ('queued', 'running'))
  ) then raise exception 'workspace_runtime_busy'; end if;

  update public.projects
    set name = coalesce(v_name, name),
        status = coalesce(p_status::public.project_status, status),
        updated_at = now()
    where id = p_project
    returning * into v_project;

  insert into public.audit_events(actor_id, project_id, action, metadata)
    values (
      p_actor,
      p_project,
      case when p_status = 'archived' then 'project.archived' else 'project.updated' end,
      jsonb_strip_nulls(jsonb_build_object('name', p_name, 'status', p_status))
    );
  return to_jsonb(v_project);
end;
$$;

revoke all on function public.mutate_project(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mutate_project(uuid, uuid, text, text) to service_role;

-- Compare-and-swap save for workspaces that have no live runtime. The project
-- row lock is also taken by enqueue_runtime_job, so a runtime cannot start
-- between the stopped-state check and this transaction's file replacement.
create or replace function public.commit_workspace_files(
  p_project uuid,
  p_actor uuid,
  p_expected jsonb,
  p_files jsonb,
  p_description text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_version uuid;
  v_expected jsonb;
  v_current jsonb;
  v_files jsonb;
  v_file jsonb;
  v_description text;
begin
  if p_project is null or p_actor is null or p_expected is null or p_files is null
     or jsonb_typeof(p_expected) is distinct from 'array'
     or jsonb_typeof(p_files) is distinct from 'array' then
    raise exception 'invalid_workspace_snapshot';
  end if;
  if jsonb_array_length(p_expected) > 1000 or jsonb_array_length(p_files) > 1000 then
    raise exception 'invalid_workspace_snapshot';
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
  ) then
    raise exception 'not_authorized';
  end if;

  if exists (
    select 1 from public.project_runtimes r
    where r.project_id = p_project and r.state not in ('stopped', 'error')
  ) or exists (
    select 1 from public.runtime_jobs j
    where j.project_id = p_project and j.state in ('queued', 'running')
  ) then
    raise exception 'workspace_runtime_busy';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('path', f.path, 'kind', f.kind, 'hash', f.hash) order by f.path), '[]'::jsonb)
    into v_current from public.runtime_files f where f.project_id = p_project;
  select coalesce(jsonb_agg(jsonb_build_object(
      'path', e.value ->> 'path', 'kind', e.value ->> 'kind', 'hash', e.value ->> 'hash'
    ) order by e.value ->> 'path'), '[]'::jsonb)
    into v_expected from jsonb_array_elements(p_expected) e(value);
  if v_expected <> v_current then raise exception 'workspace_conflict'; end if;

  v_files := p_files;
  for v_file in select value from jsonb_array_elements(v_files)
  loop
    if jsonb_typeof(v_file) <> 'object'
       or coalesce(v_file ->> 'path', '') = ''
       or char_length(v_file ->> 'path') > 1024
       or position(chr(92) in (v_file ->> 'path')) > 0
       or (v_file ->> 'path') ~ '[[:cntrl:]:]'
       or (v_file ->> 'path') ~ '(^/|/$|//|(^|/)\.{1,2}(/|$))'
       or (v_file ->> 'path') ~* '(^|/)(node_modules|\.git|\.next|dist|build|\.cache|__pycache__|\.venv|\.runly|\.npmrc|\.pypirc|\.netrc|\.ssh|\.aws)(/|$)'
       or (v_file ->> 'path') ~* '(^|/)\.env[^/]*(/|$)'
       or (v_file ->> 'path') ~* '(\.pem|\.key)$'
       or (v_file ->> 'path') ~* '(^|/)(id_rsa|id_ed25519|credentials\.json|service-account\.json)$'
       or coalesce(v_file ->> 'kind', '') not in ('file', 'folder')
       or jsonb_typeof(v_file -> 'content') is distinct from 'string'
       or octet_length(v_file ->> 'content') > 1048576
       or char_length(coalesce(v_file ->> 'hash', '')) > 64 then
      raise exception 'invalid_workspace_file';
    end if;
  end loop;
  if octet_length(v_files::text) > 10485760 then raise exception 'workspace_snapshot_too_large'; end if;

  delete from public.runtime_files where project_id = p_project;
  insert into public.runtime_files(project_id, path, kind, content, hash)
    select p_project, f.value ->> 'path', f.value ->> 'kind', f.value ->> 'content', f.value ->> 'hash'
    from jsonb_array_elements(v_files) f(value);

  v_description := nullif(left(btrim(coalesce(p_description, '')), 500), '');
  insert into public.project_versions(project_id, actor_id, label, description, encrypted_manifest, files)
    values (p_project, p_actor, coalesce(v_description, 'Workspace save'), v_description, null, v_files)
    returning id into v_version;

  update public.projects set updated_at = now() where id = p_project;
  insert into public.audit_events(actor_id, project_id, action, metadata)
    values (p_actor, p_project, 'workspace.saved', jsonb_build_object('version_id', v_version, 'file_count', jsonb_array_length(v_files)));
  return v_version;
end;
$$;

-- Snapshot the already persisted workspace after the gateway confirms its
-- serialized replace. Project lock coordinates with runtime admission.
create or replace function public.snapshot_workspace_version(
  p_project uuid,
  p_actor uuid,
  p_description text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_files jsonb;
  v_version uuid;
  v_description text;
begin
  if p_project is null or p_actor is null then raise exception 'invalid_workspace_snapshot'; end if;
  select * into v_project from public.projects where id = p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if not exists (
    select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null
  ) or not (
    v_project.owner_id = p_actor
    or (v_project.workspace_id is not null and exists (
      select 1 from public.memberships m
      where m.workspace_id = v_project.workspace_id and m.user_id = p_actor
    ))
  ) then
    raise exception 'not_authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'path', f.path, 'kind', f.kind, 'content', f.content, 'hash', f.hash
    ) order by f.path), '[]'::jsonb)
    into v_files from public.runtime_files f where f.project_id = p_project;
  if octet_length(v_files::text) > 10485760 then raise exception 'workspace_snapshot_too_large'; end if;
  v_description := nullif(left(btrim(coalesce(p_description, '')), 500), '');
  insert into public.project_versions(project_id, actor_id, label, description, encrypted_manifest, files)
    values (p_project, p_actor, coalesce(v_description, 'Workspace save'), v_description, null, v_files)
    returning id into v_version;

  update public.projects set updated_at = now() where id = p_project;
  insert into public.audit_events(actor_id, project_id, action, metadata)
    values (p_actor, p_project, 'workspace.snapshot_created', jsonb_build_object('version_id', v_version, 'file_count', jsonb_array_length(v_files)));
  return v_version;
end;
$$;

revoke all on function public.commit_workspace_files(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.snapshot_workspace_version(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.commit_workspace_files(uuid, uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.snapshot_workspace_version(uuid, uuid, text) to service_role;

-- Persist-only chat submission for the currently deferred sandbox workflow.
-- Replays with the same message ID are accepted only when their full payload
-- matches, preventing accidental duplicate messages or idempotency-key reuse.
create or replace function public.persist_workspace_message(
  p_project uuid,
  p_actor uuid,
  p_id uuid,
  p_chat uuid,
  p_input text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_message public.messages;
begin
  if p_project is null or p_actor is null or p_id is null or p_chat is null
     or p_input is null or char_length(p_input) not between 1 and 50000 then
    raise exception 'invalid_message';
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

  if p_chat = p_id then
    insert into public.conversations(id, project_id) values (p_chat, p_project)
      on conflict (id) do nothing;
  end if;
  if not exists (
    select 1 from public.conversations c where c.id = p_chat and c.project_id = p_project
  ) then raise exception 'chat_missing'; end if;

  select * into v_message from public.messages where id = p_id;
  if found then
    if v_message.conversation_id <> p_chat or v_message.actor_id <> p_actor
       or v_message.role <> 'user' or v_message.body <> p_input then
      raise exception 'idempotency_conflict';
    end if;
    return p_chat;
  end if;

  insert into public.messages(id, conversation_id, actor_id, role, body)
    values (p_id, p_chat, p_actor, 'user', p_input);
  update public.projects set updated_at = now() where id = p_project;
  insert into public.audit_events(actor_id, project_id, action, metadata)
    values (p_actor, p_project, 'message.persisted', jsonb_build_object('message_id', p_id, 'chat_id', p_chat));
  return p_chat;
end;
$$;
revoke all on function public.persist_workspace_message(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.persist_workspace_message(uuid, uuid, uuid, uuid, text) to service_role;

create or replace function public.remove_admin_nest(p_actor uuid, p_nest uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  v_nest public.nests;
begin
  if p_actor is null or p_nest is null then raise exception 'not_authorized'; end if;
  select r.user_id into v_admin
  from public.account_roles r
  join auth.users u on u.id = r.user_id
  where r.user_id = p_actor and r.role = 'admin' and u.email_confirmed_at is not null
  for update of r;
  if not found then raise exception 'not_authorized'; end if;

  select * into v_nest from public.nests where id = p_nest for update;
  if not found then raise exception 'nest_missing'; end if;
  if coalesce(v_nest.active_eggs, 0) > 0 then raise exception 'nest_busy'; end if;

  delete from public.nests where id = p_nest;
  insert into public.audit_events(actor_id, action, metadata)
    values (
      p_actor,
      'admin.nest.deleted',
      jsonb_build_object(
        'nest_id', v_nest.id,
        'name', v_nest.name,
        'endpoint', v_nest.endpoint,
        'country_code', v_nest.country_code
      )
    );
end;
$$;
revoke all on function public.remove_admin_nest(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_admin_nest(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
