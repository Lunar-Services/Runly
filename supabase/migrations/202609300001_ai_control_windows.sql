-- Match displayed usage windows to the admission rules and keep old usage
-- events intact when an administrator resets a user's allowance.
-- Zero is a real price; unknown provider and sandbox costs remain NULL.
alter table public.ai_request_logs alter column ai_cost_micros drop not null;
alter table public.ai_request_logs alter column ai_cost_micros drop default;
alter table public.ai_request_logs alter column sandbox_cost_micros drop not null;
alter table public.ai_request_logs alter column sandbox_cost_micros drop default;

create or replace function public.project_usage_summary(p_project uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects; ent public.plan_entitlements; plan public.subscription_plans;
  control public.ai_user_controls; reset_at timestamptz; bonus bigint;
  used3 bigint; used7 bigint; reserved3 bigint; reserved7 bigint;
begin
  select * into p from public.projects where id=p_project;
  if not found or auth.uid() is null or not (p.owner_id=auth.uid() or exists (
    select 1 from public.memberships where workspace_id=p.workspace_id and user_id=auth.uid()
  )) then raise exception 'not_authorized'; end if;
  select * into ent from public.plan_entitlements where active and starts_at<=now()
    and (ends_at is null or ends_at>now())
    and ((p.workspace_id is null and user_id=p.owner_id) or workspace_id=p.workspace_id)
    order by starts_at desc limit 1;
  if not found then return jsonb_build_object('active',false); end if;
  select * into plan from public.subscription_plans where id=ent.plan_id;
  select * into control from public.ai_user_controls where user_id=auth.uid();
  reset_at := coalesce(control.limit_reset_at,'epoch'::timestamptz);
  bonus := coalesce(control.extra_tokens,0);
  select coalesce(sum(input_tokens+output_tokens) filter (where created_at>greatest(now()-interval '3 hours',reset_at)),0),
         coalesce(sum(input_tokens+output_tokens),0) into used3,used7
    from public.usage_events where created_at>greatest(now()-interval '7 days',reset_at)
    and (user_id=ent.user_id or workspace_id=ent.workspace_id);
  select coalesce(sum(reserved_tokens) filter (where created_at>greatest(now()-interval '3 hours',reset_at)),0),
         coalesce(sum(reserved_tokens),0) into reserved3,reserved7
    from public.usage_reservations where status='reserved'
    and created_at>greatest(now()-interval '7 days',reset_at)
    and (user_id=ent.user_id or workspace_id=ent.workspace_id);
  return jsonb_build_object('active',true,'plan',plan.name,
    'suspended',coalesce(control.suspended,false),
    'threeHour',jsonb_build_object('used',used3,'reserved',reserved3,'limit',plan.window_3h_tokens+bonus),
    'sevenDay',jsonb_build_object('used',used7,'reserved',reserved7,'limit',plan.window_7d_tokens+bonus));
end $$;

create or replace function public.enqueue_runtime_job(p_id uuid,p_project uuid,p_actor uuid,p_gateway text,p_kind text,p_chat uuid default null,p_input text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare n integer; existing public.runtime_jobs; p public.projects;
  policy public.runtime_policy; ent public.plan_entitlements; plan public.subscription_plans;
  control public.ai_user_controls; used3 bigint; used7 bigint; reserved3 bigint; reserved7 bigint; reservation uuid;
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
  if p.status='archived' and p_kind<>'stop' then raise exception 'project_archived'; end if;
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
             coalesce(sum(input_tokens+output_tokens),0) into used3,used7
        from public.usage_events where created_at>greatest(now()-interval '7 days',reset_at)
        and (user_id=ent.user_id or workspace_id=ent.workspace_id);
      select coalesce(sum(reserved_tokens) filter(where created_at>greatest(now()-interval '3 hours',reset_at)),0),
             coalesce(sum(reserved_tokens),0) into reserved3,reserved7
        from public.usage_reservations where status='reserved'
        and created_at>greatest(now()-interval '7 days',reset_at)
        and (user_id=ent.user_id or workspace_id=ent.workspace_id);
      if used3+reserved3+policy.reservation_tokens>plan.window_3h_tokens+bonus
         or used7+reserved7+policy.reservation_tokens>plan.window_7d_tokens+bonus then raise exception 'quota_exhausted'; end if;
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
