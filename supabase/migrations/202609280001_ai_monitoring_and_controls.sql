-- Admin controls and durable request telemetry for the Runly AI runtime.
create table public.ai_user_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended boolean not null default false,
  suspension_reason text check (char_length(suspension_reason) <= 500),
  limit_reset_at timestamptz,
  extra_tokens bigint not null default 0 check (extra_tokens between 0 and 1000000000),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.ai_request_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique references public.runtime_jobs(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  provider_request_id text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  ai_cost_micros bigint not null default 0,
  sandbox_cost_micros bigint not null default 0,
  latency_ms integer not null default 0,
  tools_used jsonb not null default '[]'::jsonb,
  tool_calls integer not null default 0,
  files_edited integer not null default 0,
  commands_run integer not null default 0,
  agent_retries integer not null default 0,
  success boolean not null,
  rate_limited boolean not null default false,
  error text,
  sandbox_session_id text,
  sandbox_runtime_ms integer not null default 0,
  cpu_percent numeric,
  ram_mb numeric,
  created_at timestamptz not null default now()
);
create index ai_request_logs_created_idx on public.ai_request_logs(created_at desc);
create index ai_request_logs_user_created_idx on public.ai_request_logs(user_id,created_at desc);
create index ai_request_logs_project_created_idx on public.ai_request_logs(project_id,created_at desc);

alter table public.project_runtimes
  add column if not exists sandbox_started_at timestamptz,
  add column if not exists cpu_percent numeric,
  add column if not exists ram_mb numeric;

alter table public.ai_user_controls enable row level security;
alter table public.ai_request_logs enable row level security;
revoke all on public.ai_user_controls, public.ai_request_logs from public, anon, authenticated;
grant all on public.ai_user_controls, public.ai_request_logs to service_role;

-- Keep the named owner recoverable if this migration is applied after signup.
insert into public.platform_owners(user_id)
select id from auth.users where lower(email)='ibrahimfalih7@gmail.com'
on conflict do nothing;
insert into public.account_roles(user_id,role)
select id,'admin' from auth.users where lower(email)='ibrahimfalih7@gmail.com'
on conflict (user_id) do update set role='admin';

-- Admission honors suspensions, manual resets, and extra token grants while
-- retaining immutable usage logs for operations and abuse review.
create or replace function public.enqueue_runtime_job(p_id uuid,p_project uuid,p_actor uuid,p_gateway text,p_kind text,p_chat uuid default null,p_input text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare n integer; existing public.runtime_jobs; p public.projects;
  policy public.runtime_policy; ent public.plan_entitlements; plan public.subscription_plans;
  control public.ai_user_controls; used3 bigint; used7 bigint; reservation uuid;
  reset_at timestamptz; bonus bigint;
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
  select * into control from public.ai_user_controls where user_id=p_actor;
  if p_kind<>'stop' and coalesce(control.suspended,false) then raise exception 'ai_suspended'; end if;
  reset_at := coalesce(control.limit_reset_at,'epoch'::timestamptz);
  bonus := coalesce(control.extra_tokens,0);
  select count(*) into n from public.runtime_jobs where project_id=p_project and state in ('queued','running');
  if n>=8 then raise exception 'queue_full'; end if;
  if p_kind<>'stop' then
    select * into policy from public.runtime_policy where id for update;
    if not policy.enabled or exists(select 1 from public.provider_config where emergency_stop) then raise exception 'runtime_disabled'; end if;
    if (select count(*) from public.runtime_jobs where kind=p_kind and created_at>now()-interval '24 hours') >=
       (case when p_kind='agent' then policy.daily_agent_limit else policy.daily_start_limit end) then raise exception 'daily_limit'; end if;
    select * into ent from public.plan_entitlements where active and starts_at<=now() and (ends_at is null or ends_at>now())
      and ((p.workspace_id is null and user_id=p.owner_id) or workspace_id=p.workspace_id) order by starts_at desc limit 1 for update;
    if not found then raise exception 'no_entitlement'; end if;
    if p_kind='agent' then
      select * into plan from public.subscription_plans where id=ent.plan_id;
      select coalesce(sum(input_tokens+output_tokens) filter(where created_at>greatest(now()-interval '3 hours',reset_at)),0),
             coalesce(sum(input_tokens+output_tokens) filter(where created_at>reset_at),0)
        into used3,used7 from public.usage_events where created_at>greatest(now()-interval '7 days',reset_at)
        and (user_id=ent.user_id or workspace_id=ent.workspace_id);
      select used3+coalesce(sum(reserved_tokens),0),used7+coalesce(sum(reserved_tokens),0) into used3,used7
        from public.usage_reservations where status='reserved' and created_at>reset_at and (user_id=ent.user_id or workspace_id=ent.workspace_id);
      if used3+policy.reservation_tokens>plan.window_3h_tokens+bonus or used7+policy.reservation_tokens>plan.window_7d_tokens+bonus then raise exception 'quota_exhausted'; end if;
      insert into public.usage_reservations(user_id,workspace_id,project_id,idempotency_key,reserved_tokens,expires_at)
        values(ent.user_id,ent.workspace_id,p_project,p_id,policy.reservation_tokens,now()+interval '24 hours') returning id into reservation;
    end if;
  end if;
  if p_kind='agent' and p_chat=p_id then insert into public.conversations(id,project_id) values(p_chat,p_project) on conflict do nothing; end if;
  if p_kind='agent' and not exists(select 1 from public.conversations where id=p_chat and project_id=p_project) then raise exception 'chat_missing'; end if;
  insert into public.project_runtimes(project_id,gateway_id) values(p_project,p_gateway) on conflict do nothing;
  insert into public.runtime_jobs(id,project_id,actor_id,kind,conversation_id,input,reservation_id) values(p_id,p_project,p_actor,p_kind,p_chat,p_input,reservation);
  if p_kind='agent' then insert into public.messages(id,conversation_id,actor_id,role,body) values(p_id,p_chat,p_actor,'user',p_input); end if;
  return p_id;
end $$;
revoke all on function public.enqueue_runtime_job(uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_runtime_job(uuid,uuid,uuid,text,text,uuid,text) to service_role;
