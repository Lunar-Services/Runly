-- Account avatars and Stripe billing state. Apply after 202609220001_initial_secure_schema.sql.

alter table public.profiles add column if not exists avatar_path text;
do $$ begin
  alter table public.profiles add constraint profiles_avatar_path_owner check (
    avatar_path is null or avatar_path like id::text || '/avatar.%'
  );
exception when duplicate_object then null;
end $$;

-- Browser credentials may only change the non-sensitive profile fields. Avatar
-- paths and legacy URLs are written by the authenticated server endpoint.
revoke update on public.profiles from authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- There are intentionally no client Storage policies for this bucket. The
-- authenticated server validates the bytes and controls the only permitted
-- object path before using the service role to upload or sign the image.

create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
revoke all on public.stripe_customers from public, anon, authenticated;

alter table public.subscriptions add column if not exists stripe_price_id text;
alter table public.subscriptions add column if not exists stripe_product_id text;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column if not exists stripe_event_created bigint not null default 0;
create index if not exists subscriptions_stripe_customer_id_idx on public.subscriptions(stripe_customer_id);

alter table public.stripe_webhook_events add column if not exists completed_at timestamptz;
alter table public.stripe_webhook_events add column if not exists processing_started_at timestamptz;

-- A user must never receive two simultaneously active personal entitlements.
-- It also provides a database backstop if Stripe delivers overlapping events.
create unique index if not exists plan_entitlements_one_active_user_idx
on public.plan_entitlements(user_id)
where active and user_id is not null;

-- Supabase RPC exposes functions from public. These remain server-only because
-- every client role is explicitly revoked below; the service role calls them.
create or replace function public.claim_stripe_webhook_event(
  p_event_id text, p_event_type text, p_payload_sha256 text
) returns text
language plpgsql security definer set search_path='' as $$
declare claim_state text;
begin
  insert into public.stripe_webhook_events(
    event_id, event_type, payload_sha256, processing_started_at
  ) values (p_event_id, p_event_type, p_payload_sha256, now())
  on conflict (event_id) do nothing;
  if found then return 'claimed'; end if;

  select case
    when completed_at is not null then 'completed'
    when processing_started_at is not null
      and processing_started_at > now() - interval '10 minutes' then 'processing'
    else 'stale'
  end into claim_state
  from public.stripe_webhook_events where event_id = p_event_id;
  if claim_state in ('completed', 'processing') then return claim_state; end if;

  update public.stripe_webhook_events
  set event_type = p_event_type, payload_sha256 = p_payload_sha256,
      processing_started_at = now()
  where event_id = p_event_id and completed_at is null
    and (processing_started_at is null
      or processing_started_at <= now() - interval '10 minutes');
  return case when found then 'claimed' else 'processing' end;
end $$;

create or replace function public.complete_stripe_webhook_event(p_event_id text)
returns void language sql security definer set search_path='' as $$
  update public.stripe_webhook_events
  set completed_at = now(), processing_started_at = null
  where event_id = p_event_id;
$$;

create or replace function public.release_stripe_webhook_event(p_event_id text)
returns void language sql security definer set search_path='' as $$
  update public.stripe_webhook_events
  set processing_started_at = null
  where event_id = p_event_id and completed_at is null;
$$;

revoke all on function public.claim_stripe_webhook_event(text,text,text), public.complete_stripe_webhook_event(text), public.release_stripe_webhook_event(text) from public, anon, authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql security definer set search_path='' as $$
begin new.updated_at = now(); return new; end $$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
drop trigger if exists stripe_customers_touch_updated_at on public.stripe_customers;
create trigger stripe_customers_touch_updated_at before update on public.stripe_customers
for each row execute function private.touch_updated_at();
