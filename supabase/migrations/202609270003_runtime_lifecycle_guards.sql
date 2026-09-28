-- A shard has exactly one active gateway. Expiring process leases prevent two
-- deployments from both claiming ownership of its live WebSocket connections.
create table public.runtime_gateway_leases (
  gateway_id text primary key,
  worker_id uuid not null,
  expires_at timestamptz not null
);
alter table public.runtime_gateway_leases enable row level security;
revoke all on public.runtime_gateway_leases from anon,authenticated;
grant all on public.runtime_gateway_leases to service_role;
create function public.lease_runtime_gateway(p_gateway text,p_worker uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  insert into public.runtime_gateway_leases(gateway_id,worker_id,expires_at)
    values(p_gateway,p_worker,now()+interval '45 seconds')
    on conflict(gateway_id) do update set worker_id=excluded.worker_id,expires_at=excluded.expires_at
    where public.runtime_gateway_leases.worker_id=p_worker or public.runtime_gateway_leases.expires_at<now();
  return found;
end $$;
revoke all on function public.lease_runtime_gateway(text,uuid) from public,anon,authenticated;
grant execute on function public.lease_runtime_gateway(text,uuid) to service_role;

alter table public.runtime_jobs add column provider_submitted boolean not null default false;

-- Random per-sandbox host capability for isolated preview routing.
alter table public.project_runtimes add column preview_token_hash text;
create unique index project_runtimes_preview_token on public.project_runtimes(preview_token_hash)
  where preview_token_hash is not null;

create function private.guard_runtime_chat_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.runtime_jobs where conversation_id=old.id and state in ('queued','running')) then
    raise exception 'This chat has pending tasks. Wait for them to finish before deleting it.';
  end if;
  return old;
end $$;
create trigger guard_runtime_chat_deletion before delete on public.conversations
  for each row execute function private.guard_runtime_chat_deletion();
