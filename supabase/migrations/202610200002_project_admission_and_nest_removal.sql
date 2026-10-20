-- Serialize paid project admission and Nest removal with the same database
-- transaction that records the corresponding audit events.

-- Reconcile additive objects that may have been introduced after the first
-- version of 202610200001 was already applied to a developer database.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public, anon, authenticated;
grant all on public.audit_events to service_role;

alter table public.profiles add column if not exists theme text not null default 'light';
do $$ begin
  alter table public.profiles add constraint profiles_theme_check check (theme in ('light', 'dark', 'system'));
exception when duplicate_object then null;
end $$;

create table if not exists public.swiftlet_settings (
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
alter table public.swiftlet_settings add column if not exists encrypted_api_token text;
alter table public.swiftlet_settings add column if not exists token_set_at timestamptz;
alter table public.swiftlet_settings add column if not exists updated_by uuid references auth.users(id) on delete set null;
insert into public.swiftlet_settings(id) values (true) on conflict (id) do nothing;
alter table public.swiftlet_settings enable row level security;
revoke all on public.swiftlet_settings from public, anon, authenticated;
grant all on public.swiftlet_settings to service_role;

create table if not exists public.admin_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_range integer not null default 30 check (default_range in (7, 30, 90)),
  updated_at timestamptz not null default now()
);
alter table public.admin_preferences enable row level security;
revoke all on public.admin_preferences from public, anon, authenticated;
grant all on public.admin_preferences to service_role;

create table if not exists public.nests (
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
alter table public.nests add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.nests add column if not exists updated_by uuid references auth.users(id) on delete set null;
create index if not exists nests_status_idx on public.nests(status, country_code);
create unique index if not exists nests_unique_name_idx on public.nests(lower(name));
alter table public.nests enable row level security;
revoke all on public.nests from public, anon, authenticated;
grant all on public.nests to service_role;

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
  v_actor := coalesce(nullif(v_row ->> 'updated_by', '')::uuid,
                      nullif(v_row ->> 'created_by', '')::uuid,
                      nullif(v_row ->> 'user_id', '')::uuid);
  if tg_table_name = 'swiftlet_settings' then
    v_action := 'admin.swiftlet_settings.updated';
    v_metadata := jsonb_build_object(
      'endpoint', v_row ->> 'endpoint', 'scheduling', v_row ->> 'scheduling',
      'max_eggs', (v_row ->> 'max_eggs')::integer,
      'idle_minutes', (v_row ->> 'idle_minutes')::integer,
      'heartbeat_seconds', (v_row ->> 'heartbeat_seconds')::integer,
      'provisioning_seconds', (v_row ->> 'provisioning_seconds')::integer,
      'token_configured', v_row ->> 'encrypted_api_token' is not null,
      'token_set_at', v_row ->> 'token_set_at');
  elsif tg_table_name = 'nests' then
    v_action := case when tg_op = 'INSERT' then 'admin.nest.created' when tg_op = 'DELETE' then 'admin.nest.deleted' else 'admin.nest.updated' end;
    v_metadata := jsonb_build_object(
      'nest_id', v_row ->> 'id', 'name', v_row ->> 'name', 'endpoint', v_row ->> 'endpoint',
      'country_code', v_row ->> 'country_code', 'max_eggs', (v_row ->> 'max_eggs')::integer,
      'status', v_row ->> 'status', 'credential_configured', v_row ->> 'credential_hash' is not null);
  elsif tg_table_name = 'admin_preferences' then
    v_action := case when tg_op = 'DELETE' then 'admin.preferences.deleted' else 'admin.preferences.updated' end;
    v_metadata := jsonb_build_object('default_range', (v_row ->> 'default_range')::integer);
  end if;
  insert into public.audit_events(actor_id, action, metadata) values (v_actor, v_action, v_metadata);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.audit_admin_configuration_change() from public, anon, authenticated;
drop trigger if exists swiftlet_settings_touch_updated_at on public.swiftlet_settings;
create trigger swiftlet_settings_touch_updated_at before update on public.swiftlet_settings
  for each row execute function private.touch_updated_at();
drop trigger if exists admin_preferences_touch_updated_at on public.admin_preferences;
create trigger admin_preferences_touch_updated_at before update on public.admin_preferences
  for each row execute function private.touch_updated_at();
drop trigger if exists nests_touch_updated_at on public.nests;
create trigger nests_touch_updated_at before update on public.nests
  for each row execute function private.touch_updated_at();
drop trigger if exists swiftlet_settings_audit on public.swiftlet_settings;
create trigger swiftlet_settings_audit after insert or update on public.swiftlet_settings
  for each row execute function private.audit_admin_configuration_change();
drop trigger if exists nests_audit on public.nests;
create trigger nests_audit after insert or update on public.nests
  for each row execute function private.audit_admin_configuration_change();
drop trigger if exists admin_preferences_audit on public.admin_preferences;
create trigger admin_preferences_audit after insert or update or delete on public.admin_preferences
  for each row execute function private.audit_admin_configuration_change();

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
  if (v_template is null) <> (v_language is null) then raise exception 'invalid_project_template'; end if;

  -- This user-row lock serializes concurrent project creations and unarchives.
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
    id, owner_id, workspace_id, name, status, template_id, programming_language
  ) values (
    v_project_id, p_actor, null, v_name, 'draft', v_template, v_language
  );
  insert into public.audit_events(actor_id, project_id, action, metadata)
    values (p_actor, v_project_id, 'project.created', jsonb_build_object('name', v_name, 'template_id', v_template, 'programming_language', v_language));
  return v_project_id;
end;
$$;
revoke all on function public.create_workspace_project(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_workspace_project(jsonb, uuid) to service_role;

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
  v_owner uuid;
  v_name text;
  v_project_cap integer;
  v_owned_count bigint;
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

  select owner_id into v_owner from public.projects where id = p_project;
  if not found then raise exception 'project_missing'; end if;
  if v_owner <> p_actor then raise exception 'not_authorized'; end if;

  -- Match the project-creation lock order when restoring an archived project.
  if p_status in ('draft', 'active') then
    perform 1 from auth.users u
    where u.id = p_actor and u.email_confirmed_at is not null
    for update;
    if not found then raise exception 'not_authorized'; end if;
  end if;

  select * into v_project from public.projects where id = p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if v_project.owner_id <> p_actor or not exists (
    select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null
  ) then raise exception 'not_authorized'; end if;

  if p_status = 'archived' and (
    exists (select 1 from public.project_runtimes r where r.project_id = p_project and r.state not in ('stopped', 'error'))
    or exists (select 1 from public.runtime_jobs j where j.project_id = p_project and j.state in ('queued', 'running'))
  ) then raise exception 'workspace_runtime_busy'; end if;

  if v_project.status = 'archived' and p_status in ('draft', 'active') then
    select pl.project_cap into v_project_cap
    from public.plan_entitlements ent
    join public.subscription_plans pl on pl.id = ent.plan_id
    where ent.user_id = p_actor and ent.workspace_id is null and ent.active
      and ent.starts_at <= now() and (ent.ends_at is null or ent.ends_at > now())
    order by ent.starts_at desc
    limit 1;
    if v_project_cap is not null then
      select count(*) into v_owned_count
      from public.projects p
      where p.owner_id = p_actor and p.status <> 'archived' and p.id <> p_project;
      if v_owned_count >= v_project_cap then raise exception 'project_cap_reached'; end if;
    end if;
  end if;

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

drop trigger if exists nests_audit on public.nests;
create trigger nests_audit
  after insert or update on public.nests
  for each row execute function private.audit_admin_configuration_change();

notify pgrst, 'reload schema';
