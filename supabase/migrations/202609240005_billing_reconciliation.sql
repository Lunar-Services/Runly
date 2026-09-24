-- Records successful Stripe pull reconciliations independently from webhook
-- updates, so a customer with no subscription is not queried on every visit.
alter table public.stripe_customers
  add column if not exists last_reconciled_at timestamptz;

create index if not exists stripe_customers_reconciliation_idx
  on public.stripe_customers(last_reconciled_at);
