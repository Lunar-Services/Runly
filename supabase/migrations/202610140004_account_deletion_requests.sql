create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'cancelled')),
  requested_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint account_deletion_requests_status_timestamps_check check (
    (status = 'pending' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create unique index if not exists account_deletion_requests_one_pending_per_user
  on public.account_deletion_requests (user_id)
  where status = 'pending';

create index if not exists account_deletion_requests_pending_queue
  on public.account_deletion_requests (requested_at desc)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;

drop policy if exists "Users can view their own account deletion requests"
  on public.account_deletion_requests;
create policy "Users can view their own account deletion requests"
  on public.account_deletion_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.account_deletion_requests from public, anon, authenticated;
grant select on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;

comment on table public.account_deletion_requests is
  'Records account deletion requests for operator review; it does not delete account data or cancel billing.';
