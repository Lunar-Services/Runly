-- Runly initial schema. Review and test in a disposable Supabase project before production.
create extension if not exists pgcrypto;

create type public.workspace_role as enum ('owner','admin','member');
create type public.project_status as enum ('draft','active','archived');
create type public.job_status as enum ('queued','running','succeeded','failed','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
  name text not null check (char_length(name) between 1 and 120), created_at timestamptz not null default now()
);
create table public.memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(), primary key (workspace_id,user_id)
);
create index memberships_user_id_idx on public.memberships(user_id);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_hash text not null, token_hash text not null unique, role public.workspace_role not null default 'member',
  expires_at timestamptz not null, accepted_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160), status public.project_status not null default 'draft',
  github_repo_id bigint, github_branch text, github_commit_sha text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index projects_owner_id_idx on public.projects(owner_id); create index projects_workspace_id_idx on public.projects(workspace_id);
create table public.project_drafts (
  project_id uuid primary key references public.projects(id) on delete cascade, encrypted_manifest bytea not null,
  version bigint not null default 1, updated_at timestamptz not null default now()
);
create table public.project_versions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  base_version_id uuid references public.project_versions(id), actor_id uuid not null references auth.users(id), label text not null,
  encrypted_manifest bytea not null, created_at timestamptz not null default now()
);
create index project_versions_project_id_idx on public.project_versions(project_id);
create table public.conversations (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  actor_id uuid references auth.users(id), role text not null check (role in ('user','assistant','system')), body text not null check (char_length(body) <= 50000),
  created_at timestamptz not null default now()
);
create index messages_conversation_id_idx on public.messages(conversation_id);
create table public.subscription_plans (
  id text primary key, name text not null, active boolean not null default false, price_cents integer,
  stripe_price_id text unique, window_3h_tokens bigint not null check (window_3h_tokens > 0), window_7d_tokens bigint not null check (window_7d_tokens > 0), project_cap integer
);
create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), workspace_id uuid references public.workspaces(id),
  plan_id text not null references public.subscription_plans(id), active boolean not null default false, starts_at timestamptz not null default now(), ends_at timestamptz,
  check ((user_id is null) <> (workspace_id is null))
);
create index plan_entitlements_user_id_idx on public.plan_entitlements(user_id); create index plan_entitlements_workspace_id_idx on public.plan_entitlements(workspace_id);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), entitlement_id uuid not null references public.plan_entitlements(id),
  stripe_customer_id text not null, stripe_subscription_id text unique, status text not null, current_period_end timestamptz, updated_at timestamptz not null default now()
);
create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), workspace_id uuid references public.workspaces(id),
  project_id uuid not null references public.projects(id), idempotency_key uuid not null unique, reserved_tokens bigint not null check (reserved_tokens > 0),
  status text not null check (status in ('reserved','settled','released','expired')) default 'reserved', expires_at timestamptz not null,
  created_at timestamptz not null default now(), check ((user_id is null) <> (workspace_id is null))
);
create index usage_reservations_user_created_idx on public.usage_reservations(user_id,created_at); create index usage_reservations_workspace_created_idx on public.usage_reservations(workspace_id,created_at);
create table public.usage_events (
  id uuid primary key default gen_random_uuid(), reservation_id uuid not null unique references public.usage_reservations(id),
  user_id uuid references auth.users(id), workspace_id uuid references public.workspaces(id), project_id uuid not null references public.projects(id),
  input_tokens bigint not null default 0, output_tokens bigint not null default 0, provider_request_id text, created_at timestamptz not null default now(),
  check ((user_id is null) <> (workspace_id is null))
);
create index usage_events_user_created_idx on public.usage_events(user_id,created_at); create index usage_events_workspace_created_idx on public.usage_events(workspace_id,created_at);
create table public.topup_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), workspace_id uuid references public.workspaces(id),
  token_delta bigint not null, source text not null, payment_event_id text, created_at timestamptz not null default now(), check ((user_id is null) <> (workspace_id is null))
);
create table public.stripe_webhook_events (event_id text primary key, event_type text not null, processed_at timestamptz not null default now(), payload_sha256 text not null);
create table public.github_connections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), installation_id bigint not null, account_login text not null,
  encrypted_token bytea, token_expires_at timestamptz, created_at timestamptz not null default now(), unique(user_id,installation_id)
);
create table public.encrypted_api_credentials (
  id uuid primary key default gen_random_uuid(), provider text not null, friendly_name text not null, encrypted_secret bytea not null,
  key_version integer not null, status text not null check (status in ('inactive','active','revoked')), created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.provider_config (
  id boolean primary key default true check (id), active_credential_id uuid references public.encrypted_api_credentials(id), model text,
  emergency_stop boolean not null default true, daily_spend_limit_cents integer not null default 0, updated_at timestamptz not null default now()
);
create table public.provider_cost_events (
  id uuid primary key default gen_random_uuid(), provider_request_id text unique, credential_id uuid references public.encrypted_api_credentials(id),
  estimated_cost_micros bigint not null default 0, created_at timestamptz not null default now()
);
create table public.legal_documents (id uuid primary key default gen_random_uuid(), slug text unique not null check (slug in ('terms','privacy')), published_version_id uuid, created_at timestamptz not null default now());
create table public.legal_versions (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.legal_documents(id), version text not null, status text not null check (status in ('draft','published','retired')),
  sanitized_html text not null, effective_at timestamptz, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(document_id,version)
);
alter table public.legal_documents add constraint legal_documents_published_version_fk foreign key (published_version_id) references public.legal_versions(id);
create table public.legal_acceptances (user_id uuid not null references auth.users(id), version_id uuid not null references public.legal_versions(id), accepted_at timestamptz not null default now(), primary key(user_id,version_id));
create table public.audit_logs (
  id bigint generated always as identity primary key, actor_id uuid references auth.users(id), action text not null, target_type text not null, target_id text,
  ip_hash text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create or replace function private.can_access_workspace(p_workspace_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships m where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()));
$$;
create or replace function private.can_access_project(p_project_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.projects p where p.id=p_project_id and (p.owner_id=(select auth.uid()) or (p.workspace_id is not null and private.can_access_workspace(p.workspace_id))));
$$;
revoke all on function private.can_access_workspace(uuid),private.can_access_project(uuid) from public,anon;
grant execute on function private.can_access_workspace(uuid),private.can_access_project(uuid) to authenticated;

alter table public.profiles enable row level security; alter table public.workspaces enable row level security; alter table public.memberships enable row level security;
alter table public.invitations enable row level security; alter table public.projects enable row level security; alter table public.project_drafts enable row level security;
alter table public.project_versions enable row level security; alter table public.conversations enable row level security; alter table public.messages enable row level security;
alter table public.subscription_plans enable row level security; alter table public.plan_entitlements enable row level security; alter table public.subscriptions enable row level security;
alter table public.usage_reservations enable row level security; alter table public.usage_events enable row level security; alter table public.topup_ledger enable row level security;
alter table public.stripe_webhook_events enable row level security; alter table public.github_connections enable row level security; alter table public.encrypted_api_credentials enable row level security;
alter table public.provider_config enable row level security; alter table public.provider_cost_events enable row level security; alter table public.legal_documents enable row level security;
alter table public.legal_versions enable row level security; alter table public.legal_acceptances enable row level security; alter table public.audit_logs enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select,insert,update,delete on public.profiles,public.workspaces,public.memberships,public.projects,public.project_drafts,public.project_versions,public.conversations,public.messages,public.github_connections to authenticated;
grant select on public.subscription_plans,public.plan_entitlements,public.subscriptions,public.usage_reservations,public.usage_events,public.topup_ledger,public.legal_documents,public.legal_versions,public.legal_acceptances to authenticated;

create policy profiles_select on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid())=id);
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy workspaces_select on public.workspaces for select to authenticated using (owner_id=(select auth.uid()) or private.can_access_workspace(id));
create policy workspaces_insert on public.workspaces for insert to authenticated with check (owner_id=(select auth.uid()));
create policy workspaces_update on public.workspaces for update to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy memberships_select on public.memberships for select to authenticated using (user_id=(select auth.uid()) or private.can_access_workspace(workspace_id));
create policy projects_select on public.projects for select to authenticated using (private.can_access_project(id));
create policy projects_insert on public.projects for insert to authenticated with check (owner_id=(select auth.uid()) and (workspace_id is null or private.can_access_workspace(workspace_id)));
create policy projects_update on public.projects for update to authenticated using (private.can_access_project(id)) with check (private.can_access_project(id));
create policy projects_delete on public.projects for delete to authenticated using (owner_id=(select auth.uid()));
create policy drafts_select on public.project_drafts for select to authenticated using (private.can_access_project(project_id));
create policy drafts_insert on public.project_drafts for insert to authenticated with check (private.can_access_project(project_id));
create policy drafts_update on public.project_drafts for update to authenticated using (private.can_access_project(project_id)) with check (private.can_access_project(project_id));
create policy versions_select on public.project_versions for select to authenticated using (private.can_access_project(project_id));
create policy versions_insert on public.project_versions for insert to authenticated with check (actor_id=(select auth.uid()) and private.can_access_project(project_id));
create policy conversations_select on public.conversations for select to authenticated using (private.can_access_project(project_id));
create policy messages_select on public.messages for select to authenticated using (exists(select 1 from public.conversations c where c.id=conversation_id and private.can_access_project(c.project_id)));
create policy plans_select on public.subscription_plans for select to authenticated using (active=true);
create policy entitlements_select on public.plan_entitlements for select to authenticated using (user_id=(select auth.uid()) or (workspace_id is not null and private.can_access_workspace(workspace_id)));
create policy subscriptions_select on public.subscriptions for select to authenticated using (exists(select 1 from public.plan_entitlements e where e.id=entitlement_id and (e.user_id=(select auth.uid()) or private.can_access_workspace(e.workspace_id))));
create policy reservations_select on public.usage_reservations for select to authenticated using (user_id=(select auth.uid()) or (workspace_id is not null and private.can_access_workspace(workspace_id)));
create policy events_select on public.usage_events for select to authenticated using (user_id=(select auth.uid()) or (workspace_id is not null and private.can_access_workspace(workspace_id)));
create policy legal_docs_select on public.legal_documents for select to authenticated using (published_version_id is not null);
create policy legal_versions_select on public.legal_versions for select to authenticated using (status='published');
create policy legal_acceptances_select on public.legal_acceptances for select to authenticated using (user_id=(select auth.uid()));

-- Privileged quota RPCs are deliberately narrow, authenticated-only, and perform their own identity checks.
create or replace function public.reserve_ai_usage(p_project_id uuid,p_idempotency_key uuid,p_max_tokens bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); v_project public.projects; v_ent public.plan_entitlements; v_used3 bigint; v_used7 bigint; v_reserved3 bigint; v_reserved7 bigint; v_id uuid;
begin
  if v_uid is null or p_max_tokens<1 or p_max_tokens>8000 then raise exception 'not_authorized'; end if;
  select * into v_project from public.projects where id=p_project_id and private.can_access_project(id) for update;
  if not found then raise exception 'not_authorized'; end if;
  select e.* into v_ent from public.plan_entitlements e where e.active and ((v_project.workspace_id is null and e.user_id=v_uid) or (v_project.workspace_id is not null and e.workspace_id=v_project.workspace_id)) and (e.ends_at is null or e.ends_at>now()) order by e.starts_at desc limit 1 for update;
  if not found then raise exception 'no_entitlement'; end if;
  select coalesce(sum(input_tokens+output_tokens),0) into v_used3 from public.usage_events where created_at>now()-interval '3 hours' and ((v_ent.workspace_id is null and user_id=v_uid) or workspace_id=v_ent.workspace_id);
  select coalesce(sum(input_tokens+output_tokens),0) into v_used7 from public.usage_events where created_at>now()-interval '7 days' and ((v_ent.workspace_id is null and user_id=v_uid) or workspace_id=v_ent.workspace_id);
  select coalesce(sum(reserved_tokens),0) into v_reserved3 from public.usage_reservations where status='reserved' and created_at>now()-interval '3 hours' and ((v_ent.workspace_id is null and user_id=v_uid) or workspace_id=v_ent.workspace_id);
  select coalesce(sum(reserved_tokens),0) into v_reserved7 from public.usage_reservations where status='reserved' and created_at>now()-interval '7 days' and ((v_ent.workspace_id is null and user_id=v_uid) or workspace_id=v_ent.workspace_id);
  if v_used3+v_reserved3+p_max_tokens>(select window_3h_tokens from public.subscription_plans where id=v_ent.plan_id) or v_used7+v_reserved7+p_max_tokens>(select window_7d_tokens from public.subscription_plans where id=v_ent.plan_id) then raise exception 'quota_exhausted'; end if;
  insert into public.usage_reservations(user_id,workspace_id,project_id,idempotency_key,reserved_tokens,expires_at) values(case when v_ent.workspace_id is null then v_uid end,v_ent.workspace_id,p_project_id,p_idempotency_key,p_max_tokens,now()+interval '3 minutes') on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into v_id;
  return v_id;
end $$;
create or replace function public.settle_ai_usage(p_reservation_id uuid,p_input_tokens bigint,p_output_tokens bigint,p_provider_request_id text) returns void language plpgsql security definer set search_path='' as $$
declare r public.usage_reservations; begin select * into r from public.usage_reservations where id=p_reservation_id and status='reserved' and (user_id=auth.uid() or private.can_access_workspace(workspace_id)) for update; if not found then raise exception 'not_authorized'; end if; insert into public.usage_events(reservation_id,user_id,workspace_id,project_id,input_tokens,output_tokens,provider_request_id) values(r.id,r.user_id,r.workspace_id,r.project_id,greatest(p_input_tokens,0),greatest(p_output_tokens,0),p_provider_request_id) on conflict(reservation_id) do nothing; update public.usage_reservations set status='settled' where id=r.id; end $$;
create or replace function public.release_ai_reservation(p_reservation_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin update public.usage_reservations set status='released' where id=p_reservation_id and status='reserved' and (user_id=auth.uid() or private.can_access_workspace(workspace_id)); end $$;
revoke all on function public.reserve_ai_usage(uuid,uuid,bigint),public.settle_ai_usage(uuid,bigint,bigint,text),public.release_ai_reservation(uuid) from public,anon;
grant execute on function public.reserve_ai_usage(uuid,uuid,bigint),public.settle_ai_usage(uuid,bigint,bigint,text),public.release_ai_reservation(uuid) to authenticated;

insert into public.subscription_plans(id,name,active,price_cents,window_3h_tokens,window_7d_tokens,project_cap) values
('standard','Standard',false,300,100000,600000,null),('pro','Pro',false,900,350000,2000000,null),('ultimate','Ultimate',false,null,750000,4000000,null),('cowork','Cowork',false,1900,1000000,5000000,null);

-- Harden the initial deployment before it is exposed to clients.
-- Usage settlement and releases must never be controlled by browser credentials.
revoke all on function public.reserve_ai_usage(uuid,uuid,bigint),public.settle_ai_usage(uuid,bigint,bigint,text),public.release_ai_reservation(uuid) from authenticated;
revoke update on public.projects from authenticated;
grant update(name,status,updated_at) on public.projects to authenticated;

create table public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_owners enable row level security;
revoke all on public.platform_owners from public,anon,authenticated;
grant select on public.platform_owners to authenticated;
create policy owners_read_self on public.platform_owners for select to authenticated using ((select auth.uid())=user_id);

-- Trigger-only role assignment. Email confirmation comes from auth.users, not editable metadata.
create function private.sync_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id) values(new.id) on conflict(id) do nothing;
  if lower(new.email)='ibrahimfalih7@gmail.com' and new.email_confirmed_at is not null then
    insert into public.platform_owners(user_id) values(new.id) on conflict(user_id) do nothing;
  else
    delete from public.platform_owners where user_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.sync_account() from public,anon,authenticated;
create trigger runly_sync_account after insert or update of email,email_confirmed_at on auth.users for each row execute function private.sync_account();

create table private.request_limits (key text primary key, count integer not null, until timestamptz not null);
alter table private.request_limits enable row level security;
revoke all on private.request_limits from public,anon,authenticated;
create function public.consume_request_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  if p_limit<1 or p_seconds<1 or p_seconds>3600 or length(p_key)>100 then return false; end if;
  insert into private.request_limits(key,count,until) values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set count=case when private.request_limits.until<now() then 1 else private.request_limits.count+1 end,
    until=case when private.request_limits.until<now() then now()+make_interval(secs=>p_seconds) else private.request_limits.until end
  returning count into used;
  return used<=p_limit;
end $$;
revoke all on function public.consume_request_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_request_limit(text,integer,integer) to service_role;
