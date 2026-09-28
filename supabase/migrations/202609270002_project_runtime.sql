-- Durable control plane. Only the backend can change runtime state or enqueue work.
create table public.project_runtimes (
  project_id uuid primary key references public.projects(id) on delete cascade,
  gateway_id text not null,
  generation uuid not null default gen_random_uuid(),
  state text not null default 'stopped' check (state in ('stopped','starting','ready','error')),
  session_id text,
  bridge_token_hash text,
  error text,
  last_active_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.runtime_files (
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null check (length(path) between 1 and 1024),
  kind text not null check (kind in ('file','folder')),
  content text not null default '' check (octet_length(content) <= 1048576),
  hash text not null default '',
  primary key(project_id,path)
);
create table public.runtime_jobs (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  kind text not null check (kind in ('start','agent','stop')),
  input text not null default '' check (length(input) <= 12000),
  state text not null default 'queued' check (state in ('queued','running','completed','failed')),
  worker_id uuid,
  lease_until timestamptz,
  error text,
  provider_turn_id text,
  usage jsonb,
  reservation_id uuid references public.usage_reservations(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index runtime_jobs_pending on public.runtime_jobs(created_at) where state='queued';
create index runtime_jobs_project on public.runtime_jobs(project_id,created_at desc);
create unique index runtime_one_active_job on public.runtime_jobs(project_id) where state='running';
alter table public.project_runtimes enable row level security;
alter table public.runtime_files enable row level security;
alter table public.runtime_jobs enable row level security;
revoke all on public.project_runtimes,public.runtime_files,public.runtime_jobs from anon,authenticated;
grant all on public.project_runtimes,public.runtime_files,public.runtime_jobs to service_role;

-- Explicit operator opt-in. Reservations are admission estimates, not a provider
-- hard spending cap; configure provider project budgets as well.
create table public.runtime_policy (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  reservation_tokens integer not null default 32000 check(reservation_tokens between 1000 and 1000000),
  daily_agent_limit integer not null default 100 check(daily_agent_limit between 1 and 10000),
  daily_start_limit integer not null default 50 check(daily_start_limit between 1 and 10000)
);
insert into public.runtime_policy default values;
alter table public.runtime_policy enable row level security;
revoke all on public.runtime_policy from anon,authenticated;
grant all on public.runtime_policy to service_role;

-- Serialize admission per project; message + job are committed together.
create function public.enqueue_runtime_job(p_id uuid,p_project uuid,p_actor uuid,p_gateway text,p_kind text,p_chat uuid default null,p_input text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare n integer; existing public.runtime_jobs; p public.projects;
  policy public.runtime_policy; ent public.plan_entitlements; plan public.subscription_plans;
  used3 bigint; used7 bigint; reservation uuid;
begin
  select * into p from public.projects where id=p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null)
     or not (p.owner_id=p_actor or exists(select 1 from public.memberships where workspace_id=p.workspace_id and user_id=p_actor)) then raise exception 'not_authorized'; end if;
  select * into existing from public.runtime_jobs where id=p_id;
  if found then
    if existing.project_id<>p_project or existing.actor_id<>p_actor or existing.kind<>p_kind or existing.input<>p_input or existing.conversation_id is distinct from p_chat then raise exception 'idempotency_conflict'; end if;
    return p_id;
  end if;
  select count(*) into n from public.runtime_jobs where project_id=p_project and state in ('queued','running');
  if n>=8 then raise exception 'queue_full'; end if;
  if p_kind<>'stop' then
    -- This lock makes global daily admission counters atomic across shards.
    select * into policy from public.runtime_policy where id for update;
    if not policy.enabled or exists(select 1 from public.provider_config where emergency_stop) then raise exception 'runtime_disabled'; end if;
    if (select count(*) from public.runtime_jobs where kind=p_kind and created_at>now()-interval '24 hours') >=
       (case when p_kind='agent' then policy.daily_agent_limit else policy.daily_start_limit end) then raise exception 'daily_limit'; end if;
    select * into ent from public.plan_entitlements where active and starts_at<=now() and (ends_at is null or ends_at>now())
      and ((p.workspace_id is null and user_id=p.owner_id) or workspace_id=p.workspace_id) order by starts_at desc limit 1 for update;
    if not found then raise exception 'no_entitlement'; end if;
    if p_kind='agent' then
      select * into plan from public.subscription_plans where id=ent.plan_id;
      select coalesce(sum(input_tokens+output_tokens) filter(where created_at>now()-interval '3 hours'),0),coalesce(sum(input_tokens+output_tokens),0)
        into used3,used7 from public.usage_events where created_at>now()-interval '7 days' and (user_id=ent.user_id or workspace_id=ent.workspace_id);
      -- Uncertain executions retain their reservation until usage is reconciled.
      select used3+coalesce(sum(reserved_tokens),0),used7+coalesce(sum(reserved_tokens),0) into used3,used7
        from public.usage_reservations where status='reserved' and (user_id=ent.user_id or workspace_id=ent.workspace_id);
      if used3+policy.reservation_tokens>plan.window_3h_tokens or used7+policy.reservation_tokens>plan.window_7d_tokens then raise exception 'quota_exhausted'; end if;
      insert into public.usage_reservations(user_id,workspace_id,project_id,idempotency_key,reserved_tokens,expires_at)
        values(ent.user_id,ent.workspace_id,p_project,p_id,policy.reservation_tokens,now()+interval '24 hours') returning id into reservation;
    end if;
  end if;
  if p_kind='agent' and p_chat=p_id then
    insert into public.conversations(id,project_id) values(p_chat,p_project) on conflict do nothing;
  end if;
  if p_kind='agent' and not exists(select 1 from public.conversations where id=p_chat and project_id=p_project) then raise exception 'chat_missing'; end if;
  insert into public.project_runtimes(project_id,gateway_id) values(p_project,p_gateway) on conflict do nothing;
  insert into public.runtime_jobs(id,project_id,actor_id,kind,conversation_id,input,reservation_id) values(p_id,p_project,p_actor,p_kind,p_chat,p_input,reservation);
  if p_kind='agent' then
    insert into public.messages(id,conversation_id,actor_id,role,body) values(p_id,p_chat,p_actor,'user',p_input);
  end if;
  return p_id;
end $$;

create function public.claim_runtime_job(p_gateway text,p_worker uuid) returns setof public.runtime_jobs
language plpgsql security definer set search_path='' as $$
declare j public.runtime_jobs;
begin
  -- Uncertain executions are never automatically replayed (avoids duplicate model work).
  update public.runtime_jobs set state='failed',error='Worker interrupted. Inspect the workspace before retrying.',finished_at=now()
    where state='running' and lease_until<now() and project_id in (select project_id from public.project_runtimes where gateway_id=p_gateway);
  for j in select q.* from public.runtime_jobs q join public.project_runtimes r on r.project_id=q.project_id
    where q.state='queued' and r.gateway_id=p_gateway
    and not exists(select 1 from public.runtime_jobs a where a.project_id=q.project_id and a.state='running')
    order by q.created_at for update of q skip locked limit 1
  loop
    begin
      return query update public.runtime_jobs set state='running',worker_id=p_worker,lease_until=now()+interval '2 minutes' where id=j.id returning *;
    exception when unique_violation then return;
    end;
  end loop;
end $$;
revoke all on function public.enqueue_runtime_job(uuid,uuid,uuid,text,text,uuid,text), public.claim_runtime_job(text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_runtime_job(uuid,uuid,uuid,text,text,uuid,text), public.claim_runtime_job(text,uuid) to service_role;

create function public.settle_runtime_usage(p_job uuid,p_input bigint,p_output bigint,p_turn text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.usage_reservations;
begin
  select * into r from public.usage_reservations where id=(select reservation_id from public.runtime_jobs where id=p_job) for update;
  if not found then raise exception 'reservation_missing'; end if;
  insert into public.usage_events(reservation_id,user_id,workspace_id,project_id,input_tokens,output_tokens,provider_request_id)
    values(r.id,r.user_id,r.workspace_id,r.project_id,greatest(p_input,0),greatest(p_output,0),p_turn) on conflict(reservation_id) do nothing;
  update public.usage_reservations set status='settled' where id=r.id;
end $$;
revoke all on function public.settle_runtime_usage(uuid,bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.settle_runtime_usage(uuid,bigint,bigint,text) to service_role;
