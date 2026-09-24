-- Durable, due-record reconciliation. Stripe webhooks remain the fast path;
-- these records make missed or delayed updates recoverable without polling the
-- entire Stripe customer base.

create table if not exists public.billing_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null check (status in ('PENDING','COMPLETED','FAILED','EXPIRED','CANCELED')),
  stripe_checkout_session_id text unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  reconcile_failures integer not null default 0 check (reconcile_failures >= 0),
  next_reconcile_at timestamptz,
  reconciliation_locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.billing_attempts enable row level security;
revoke all on public.billing_attempts from public, anon, authenticated;
create unique index if not exists billing_attempts_one_pending_user_idx
  on public.billing_attempts(user_id) where status = 'PENDING';
create index if not exists billing_attempts_due_idx
  on public.billing_attempts(next_reconcile_at)
  where status = 'PENDING' and next_reconcile_at is not null;

alter table public.subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.subscriptions s set user_id = e.user_id
from public.plan_entitlements e where e.id = s.entitlement_id and s.user_id is null;
alter table public.subscriptions add column if not exists last_stripe_sync_at timestamptz;
alter table public.subscriptions add column if not exists last_paid_invoice_id text;
alter table public.subscriptions add column if not exists next_reconcile_at timestamptz;
alter table public.subscriptions add column if not exists reconcile_failures integer not null default 0 check (reconcile_failures >= 0);
alter table public.subscriptions add column if not exists reconciliation_locked_until timestamptz;
create index if not exists subscriptions_due_reconciliation_idx
  on public.subscriptions(next_reconcile_at)
  where next_reconcile_at is not null;
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);

create table if not exists public.stripe_invoices (
  stripe_invoice_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text,
  status text not null,
  paid_at timestamptz,
  period_end timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.stripe_invoices enable row level security;
revoke all on public.stripe_invoices from public, anon, authenticated;
create index if not exists stripe_invoices_subscription_idx on public.stripe_invoices(stripe_subscription_id);

-- SKIP LOCKED lets any number of workers claim independent, bounded batches.
create or replace function public.claim_due_billing_attempts(p_limit integer, p_lock_seconds integer default 300)
returns setof public.billing_attempts language plpgsql security definer set search_path='' as $$
begin
  if p_limit < 1 or p_limit > 100 or p_lock_seconds < 30 or p_lock_seconds > 900 then
    raise exception 'invalid_claim_parameters';
  end if;
  return query
  with due as (
    select id from public.billing_attempts
    where status = 'PENDING' and next_reconcile_at <= now()
      and (reconciliation_locked_until is null or reconciliation_locked_until < now())
    order by next_reconcile_at, created_at
    limit p_limit for update skip locked
  )
  update public.billing_attempts a
  set reconciliation_locked_until = now() + make_interval(secs => p_lock_seconds),
      reconcile_failures = a.reconcile_failures + 1, updated_at = now()
  from due where a.id = due.id returning a.*;
end $$;

create or replace function public.claim_due_stripe_subscriptions(p_limit integer, p_lock_seconds integer default 300)
returns setof public.subscriptions language plpgsql security definer set search_path='' as $$
begin
  if p_limit < 1 or p_limit > 100 or p_lock_seconds < 30 or p_lock_seconds > 900 then
    raise exception 'invalid_claim_parameters';
  end if;
  return query
  with due as (
    select id from public.subscriptions
    where next_reconcile_at <= now()
      and (reconciliation_locked_until is null or reconciliation_locked_until < now())
    order by next_reconcile_at, updated_at
    limit p_limit for update skip locked
  )
  update public.subscriptions s
  set reconciliation_locked_until = now() + make_interval(secs => p_lock_seconds),
      reconcile_failures = s.reconcile_failures + 1, updated_at = now()
  from due where s.id = due.id returning s.*;
end $$;

revoke all on function public.claim_due_billing_attempts(integer,integer), public.claim_due_stripe_subscriptions(integer,integer) from public, anon, authenticated;
