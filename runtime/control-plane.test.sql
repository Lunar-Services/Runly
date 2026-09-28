-- Run against LOCAL Supabase only. All fixtures and policy changes roll back.
\set ON_ERROR_STOP on
begin;
do $$
declare
  actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
  chat uuid:=gen_random_uuid(); job uuid:=gen_random_uuid(); second_job uuid:=gen_random_uuid();
  worker uuid:=gen_random_uuid(); reservation uuid; claimed uuid; count_jobs integer;
begin
  insert into auth.users(id,email,email_confirmed_at) values(actor,actor||'@runtime.test',now()),(outsider,outsider||'@runtime.test',now());
  insert into public.projects(id,owner_id,name) values(project,actor,'Runtime transactional test');
  insert into public.conversations(id,project_id) values(chat,project);
  update public.runtime_policy set enabled=false;
  begin
    perform public.enqueue_runtime_job(job,project,actor,'test-shard','agent',chat,'test');
    raise exception 'TEST: disabled runtime was accepted';
  exception when others then if sqlerrm<>'runtime_disabled' then raise; end if; end;
  update public.runtime_policy set enabled=true,daily_agent_limit=10000,daily_start_limit=10000;
  update public.provider_config set emergency_stop=false;
  begin
    perform public.enqueue_runtime_job(job,project,outsider,'test-shard','agent',chat,'test');
    raise exception 'TEST: unauthorized actor was accepted';
  exception when others then if sqlerrm<>'not_authorized' then raise; end if; end;
  begin
    perform public.enqueue_runtime_job(job,project,actor,'test-shard','agent',chat,'test');
    raise exception 'TEST: missing entitlement was accepted';
  exception when others then if sqlerrm<>'no_entitlement' then raise; end if; end;
  insert into public.plan_entitlements(user_id,plan_id,active) values(actor,'standard',true);
  perform public.enqueue_runtime_job(job,project,actor,'test-shard','agent',chat,'test');
  perform public.enqueue_runtime_job(job,project,actor,'test-shard','agent',chat,'test');
  if (select count(*) from public.messages where id=job)<>1 then raise exception 'TEST: duplicate message'; end if;
  if (select count(*) from public.usage_reservations where idempotency_key=job)<>1 then raise exception 'TEST: duplicate reservation'; end if;
  begin
    perform public.enqueue_runtime_job(job,project,actor,'test-shard','agent',chat,'different');
    raise exception 'TEST: conflicting idempotency key was accepted';
  exception when others then if sqlerrm<>'idempotency_conflict' then raise; end if; end;
  begin
    delete from public.conversations where id=chat;
    raise exception 'TEST: pending chat deleted';
  exception when others then if sqlerrm not like 'This chat has pending tasks.%' then raise; end if; end;
  perform public.enqueue_runtime_job(second_job,project,actor,'test-shard','agent',second_job,'new chat');
  if not exists(select 1 from public.conversations where id=second_job and project_id=project) then raise exception 'TEST: atomic chat creation failed'; end if;
  select id into claimed from public.claim_runtime_job('test-shard',worker);
  if claimed is null then raise exception 'TEST: no job claimed'; end if;
  select count(*) into count_jobs from public.claim_runtime_job('test-shard',gen_random_uuid());
  if count_jobs<>0 then raise exception 'TEST: concurrent project execution'; end if;
  perform public.settle_runtime_usage(job,100,200,'test-turn');
  perform public.settle_runtime_usage(job,100,200,'test-turn');
  if (select count(*) from public.usage_events where provider_request_id='test-turn')<>1 then raise exception 'TEST: duplicate usage'; end if;
  update public.subscription_plans set window_3h_tokens=1 where id='standard';
  begin
    perform public.enqueue_runtime_job(gen_random_uuid(),project,actor,'test-shard','agent',chat,'over quota');
    raise exception 'TEST: quota bypass';
  exception when others then if sqlerrm<>'quota_exhausted' then raise; end if; end;
  if not public.lease_runtime_gateway('test-shard',worker) then raise exception 'TEST: lease failed'; end if;
  if public.lease_runtime_gateway('test-shard',gen_random_uuid()) then raise exception 'TEST: double shard ownership'; end if;
  if not public.lease_runtime_gateway('test-shard',worker) then raise exception 'TEST: renewal failed'; end if;
  if has_table_privilege('authenticated','public.runtime_files','SELECT') then raise exception 'TEST: direct file access granted'; end if;
  if has_function_privilege('authenticated','public.enqueue_runtime_job(uuid,uuid,uuid,text,text,uuid,text)','EXECUTE') then raise exception 'TEST: browser can enqueue privileged work'; end if;
  raise notice 'Runtime control-plane assertions passed';
end $$;
rollback;
