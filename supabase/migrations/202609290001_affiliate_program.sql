-- Affiliate applications, attribution, and durable 30% revenue commissions.
create table public.affiliate_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  website text not null check (char_length(website) between 3 and 300),
  audience text not null check (char_length(audience) between 10 and 1000),
  promotion_plan text not null check (char_length(promotion_plan) between 10 and 2000),
  code text unique check (code is null or code ~ '^[A-Z0-9]{6,24}$'),
  commission_bps integer not null default 3000 check (commission_bps between 0 and 10000),
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_applications(id) on delete cascade,
  referred_user_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  attributed_at timestamptz not null default now(),
  converted_at timestamptz
);

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliate_applications(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  stripe_invoice_id text not null unique,
  gross_amount_cents bigint not null check (gross_amount_cents >= 0),
  commission_amount_cents bigint not null check (commission_amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  status text not null default 'pending' check (status in ('pending','approved','paid','void')),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_invoices
  add column if not exists amount_paid_cents bigint not null default 0,
  add column if not exists currency text;

create index affiliate_applications_status_idx on public.affiliate_applications(status,created_at desc);
create index affiliate_referrals_affiliate_idx on public.affiliate_referrals(affiliate_id,attributed_at desc);
create index affiliate_commissions_affiliate_idx on public.affiliate_commissions(affiliate_id,created_at desc);

alter table public.affiliate_applications enable row level security;
alter table public.affiliate_referrals enable row level security;
alter table public.affiliate_commissions enable row level security;
revoke all on public.affiliate_applications, public.affiliate_referrals, public.affiliate_commissions from public, anon, authenticated;
grant all on public.affiliate_applications, public.affiliate_referrals, public.affiliate_commissions to service_role;

drop trigger if exists affiliate_applications_touch_updated_at on public.affiliate_applications;
create trigger affiliate_applications_touch_updated_at before update on public.affiliate_applications
for each row execute function private.touch_updated_at();
drop trigger if exists affiliate_commissions_touch_updated_at on public.affiliate_commissions;
create trigger affiliate_commissions_touch_updated_at before update on public.affiliate_commissions
for each row execute function private.touch_updated_at();
