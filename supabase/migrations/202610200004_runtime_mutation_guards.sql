-- Bring existing local databases forward without resetting data. These
-- definitions include guards added after the first 202610200001 application.

alter table public.project_versions
  alter column encrypted_manifest drop not null,
  add column if not exists description text,
  add column if not exists files jsonb not null default '[]'::jsonb;
create unique index if not exists project_versions_id_project_uidx
  on public.project_versions(id, project_id);
do $$ begin
  alter table public.project_shares
    add constraint project_shares_version_project_fkey
    foreign key (version_id, project_id)
    references public.project_versions(id, project_id)
    on delete set null (version_id);
exception when duplicate_object then null;
end $$;

alter table public.project_shares
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');
grant update (theme) on public.profiles to authenticated;
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
drop trigger if exists project_shares_rotate_on_enable on public.project_shares;
create trigger project_shares_rotate_on_enable before insert or update on public.project_shares
  for each row execute function private.rotate_project_share_on_enable();

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
  ) then raise exception 'not_authorized'; end if;

  if exists (
    select 1 from public.project_runtimes r
    where r.project_id = p_project and r.state not in ('stopped', 'error')
  ) or exists (
    select 1 from public.runtime_jobs j
    where j.project_id = p_project and j.state in ('queued', 'running')
  ) then raise exception 'workspace_runtime_busy'; end if;

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
revoke all on function public.commit_workspace_files(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.commit_workspace_files(uuid, uuid, jsonb, jsonb, text) to service_role;

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
revoke all on function public.snapshot_workspace_version(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.snapshot_workspace_version(uuid, uuid, text) to service_role;

create or replace function public.persist_workspace_message(
  p_project uuid, p_actor uuid, p_id uuid, p_chat uuid, p_input text
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
  if not exists (select 1 from public.conversations c where c.id = p_chat and c.project_id = p_project) then
    raise exception 'chat_missing';
  end if;
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

drop function if exists public.mutate_project(uuid, uuid, text, text);
create or replace function public.mutate_project(
  p_project uuid,
  p_actor uuid,
  p_name text default null,
  p_status text default null,
  p_type text default null
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
     or (p_name is null and p_status is null and p_type is null)
     or (p_status is not null and p_status not in ('draft', 'active', 'archived'))
     or (p_type is not null and p_type not in ('website', 'app', 'video')) then
    raise exception 'invalid_project_update';
  end if;
  if p_name is not null then
    v_name := btrim(p_name);
    if char_length(v_name) not between 1 and 160 then raise exception 'invalid_project_name'; end if;
  end if;
  select owner_id into v_owner from public.projects where id = p_project;
  if not found then raise exception 'project_missing'; end if;
  if v_owner <> p_actor then raise exception 'not_authorized'; end if;

  if p_status in ('draft', 'active') then
    perform 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null for update;
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
    order by ent.starts_at desc limit 1;
    if v_project_cap is not null then
      select count(*) into v_owned_count from public.projects p
      where p.owner_id = p_actor and p.status <> 'archived' and p.id <> p_project;
      if v_owned_count >= v_project_cap then raise exception 'project_cap_reached'; end if;
    end if;
  end if;
  update public.projects
    set name = coalesce(v_name, name),
        status = coalesce(p_status::public.project_status, status),
        project_type = coalesce(p_type, project_type),
        updated_at = now()
    where id = p_project returning * into v_project;
  insert into public.audit_events(actor_id, project_id, action, metadata)
    values (p_actor, p_project,
      case when p_status = 'archived' then 'project.archived' else 'project.updated' end,
      jsonb_strip_nulls(jsonb_build_object('name', p_name, 'status', p_status, 'project_type', p_type)));
  return to_jsonb(v_project);
end;
$$;
revoke all on function public.mutate_project(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mutate_project(uuid, uuid, text, text, text) to service_role;

create or replace function private.sync_profile_full_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120);
begin
  if v_name <> '' then
    update public.profiles set full_name = v_name where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_profile_full_name() from public, anon, authenticated;
drop trigger if exists runly_sync_profile_full_name on auth.users;
create trigger runly_sync_profile_full_name
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.sync_profile_full_name();

create or replace function public.save_subscription_plan(p_actor uuid, p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.subscription_plans;
  v_plan public.subscription_plans;
  v_id text;
  v_name text;
  v_product text;
  v_price text;
  v_active boolean;
  v_price_cents integer;
  v_window_3h bigint;
  v_window_7d bigint;
  v_project_cap integer;
begin
  if p_actor is null or p_plan is null or jsonb_typeof(p_plan) is distinct from 'object' then
    raise exception 'invalid_plan';
  end if;
  perform 1 from public.account_roles r join auth.users u on u.id = r.user_id
    where r.user_id = p_actor and r.role = 'admin' and u.email_confirmed_at is not null
    for update of r;
  if not found then raise exception 'not_authorized'; end if;

  v_id := p_plan ->> 'id';
  v_name := btrim(coalesce(p_plan ->> 'name', ''));
  v_product := p_plan ->> 'stripe_product_id';
  v_price := p_plan ->> 'stripe_price_id';
  v_active := (p_plan ->> 'active')::boolean;
  v_price_cents := (p_plan ->> 'price_cents')::integer;
  v_window_3h := (p_plan ->> 'window_3h_tokens')::bigint;
  v_window_7d := (p_plan ->> 'window_7d_tokens')::bigint;
  v_project_cap := nullif(p_plan ->> 'project_cap', '')::integer;
  if v_id !~ '^[a-z0-9][a-z0-9-]{1,62}$'
     or char_length(v_name) not between 1 and 120
     or v_product !~ '^prod_[A-Za-z0-9]+$'
     or v_price !~ '^price_[A-Za-z0-9]+$'
     or v_price_cents < 0
     or v_window_3h <= 0 or v_window_7d <= 0
     or (v_project_cap is not null and v_project_cap < 1) then
    raise exception 'invalid_plan';
  end if;

  select * into v_existing from public.subscription_plans where id = v_id for update;
  if found and v_existing.stripe_product_id is distinct from v_product and exists (
    select 1 from public.plan_entitlements e where e.plan_id = v_id and e.active
  ) then raise exception 'active_entitlements'; end if;

  insert into public.subscription_plans(
    id, name, active, price_cents, stripe_product_id, stripe_price_id,
    window_3h_tokens, window_7d_tokens, project_cap
  ) values (
    v_id, v_name, v_active, v_price_cents, v_product, v_price,
    v_window_3h, v_window_7d, v_project_cap
  ) on conflict (id) do update set
    name = excluded.name,
    active = excluded.active,
    price_cents = excluded.price_cents,
    stripe_product_id = excluded.stripe_product_id,
    stripe_price_id = excluded.stripe_price_id,
    window_3h_tokens = excluded.window_3h_tokens,
    window_7d_tokens = excluded.window_7d_tokens,
    project_cap = excluded.project_cap
  returning * into v_plan;

  insert into public.audit_events(actor_id, action, metadata)
    values (p_actor, 'admin.plan.saved', jsonb_build_object(
      'plan_id', v_id, 'active', v_active, 'stripe_product_id', v_product,
      'stripe_price_id', v_price, 'project_cap', v_project_cap));
  return to_jsonb(v_plan);
end;
$$;
revoke all on function public.save_subscription_plan(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_subscription_plan(uuid, jsonb) to service_role;

create or replace function public.set_subscription_plan_status(
  p_actor uuid,
  p_id text,
  p_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans;
begin
  if p_actor is null or p_id is null or p_active is null then raise exception 'invalid_plan'; end if;
  perform 1 from public.account_roles r join auth.users u on u.id = r.user_id
    where r.user_id = p_actor and r.role = 'admin' and u.email_confirmed_at is not null
    for update of r;
  if not found then raise exception 'not_authorized'; end if;

  update public.subscription_plans set active = p_active
    where id = p_id returning * into v_plan;
  if not found then raise exception 'plan_missing'; end if;
  insert into public.audit_events(actor_id, action, metadata)
    values (p_actor, 'admin.plan.status_updated', jsonb_build_object('plan_id', p_id, 'active', p_active));
  return to_jsonb(v_plan);
end;
$$;
revoke all on function public.set_subscription_plan_status(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_subscription_plan_status(uuid, text, boolean) to service_role;
