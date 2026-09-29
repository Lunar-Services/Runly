-- Project-scoped usage summary, using the same entitlement and rolling windows
-- as runtime admission. No raw usage rows or other users' data are exposed.
create function public.project_usage_summary(p_project uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  p public.projects;
  ent public.plan_entitlements;
  plan public.subscription_plans;
  used3 bigint := 0;
  used7 bigint := 0;
  reserved3 bigint := 0;
  reserved7 bigint := 0;
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
  select coalesce(sum(input_tokens+output_tokens) filter (where created_at>now()-interval '3 hours'),0),
         coalesce(sum(input_tokens+output_tokens),0)
    into used3,used7 from public.usage_events where created_at>now()-interval '7 days'
    and (user_id=ent.user_id or workspace_id=ent.workspace_id);
  select coalesce(sum(reserved_tokens) filter (where created_at>now()-interval '3 hours'),0),
         coalesce(sum(reserved_tokens),0)
    into reserved3,reserved7 from public.usage_reservations where status='reserved'
    and created_at>now()-interval '7 days'
    and (user_id=ent.user_id or workspace_id=ent.workspace_id);
  return jsonb_build_object(
    'active',true,'plan',plan.name,
    'threeHour',jsonb_build_object('used',used3,'reserved',reserved3,'limit',plan.window_3h_tokens),
    'sevenDay',jsonb_build_object('used',used7,'reserved',reserved7,'limit',plan.window_7d_tokens)
  );
end $$;
revoke all on function public.project_usage_summary(uuid) from public,anon;
grant execute on function public.project_usage_summary(uuid) to authenticated;

-- Older reserved jobs must not consume a fresh three-hour window.
create or replace function public.enqueue_runtime_job(p_id uuid,p_project uuid,p_actor uuid,p_gateway text,p_kind text,p_chat uuid default null,p_input text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare n integer; existing public.runtime_jobs; p public.projects;
  policy public.runtime_policy; ent public.plan_entitlements; plan public.subscription_plans;
  used3 bigint; used7 bigint; reserved3 bigint; reserved7 bigint; reservation uuid;
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
      select coalesce(sum(reserved_tokens) filter(where created_at>now()-interval '3 hours'),0),coalesce(sum(reserved_tokens),0)
        into reserved3,reserved7 from public.usage_reservations where status='reserved'
        and created_at>now()-interval '7 days' and (user_id=ent.user_id or workspace_id=ent.workspace_id);
      if used3+reserved3+policy.reservation_tokens>plan.window_3h_tokens or used7+reserved7+policy.reservation_tokens>plan.window_7d_tokens then raise exception 'quota_exhausted'; end if;
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
