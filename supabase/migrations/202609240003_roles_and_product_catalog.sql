-- Application roles and an administrator-managed Stripe plan catalog.

do $$ begin
  create type public.account_role as enum ('user', 'admin');
exception when duplicate_object then null;
end $$;

create table if not exists public.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.account_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.account_roles enable row level security;
revoke all on public.account_roles from public, anon, authenticated;
grant select on public.account_roles to authenticated;
create policy account_roles_read_self on public.account_roles for select to authenticated
using ((select auth.uid()) = user_id);

insert into public.account_roles(user_id)
select id from auth.users on conflict (user_id) do nothing;
-- Preserve access for the legacy bootstrap owner; all new accounts are users.
update public.account_roles set role = 'admin'
where user_id in (select user_id from public.platform_owners);

create or replace function private.sync_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id) values(new.id) on conflict(id) do nothing;
  insert into public.account_roles(user_id) values(new.id) on conflict(user_id) do nothing;
  if lower(new.email)='ibrahimfalih7@gmail.com' and new.email_confirmed_at is not null then
    insert into public.platform_owners(user_id) values(new.id) on conflict(user_id) do nothing;
    update public.account_roles set role='admin' where user_id=new.id;
  else
    delete from public.platform_owners where user_id=new.id;
  end if;
  return new;
end $$;

drop trigger if exists account_roles_touch_updated_at on public.account_roles;
create trigger account_roles_touch_updated_at before update on public.account_roles
for each row execute function private.touch_updated_at();

alter table public.subscription_plans add column if not exists stripe_product_id text unique;
alter table public.subscription_plans add constraint subscription_plans_product_id_format
check (stripe_product_id is null or stripe_product_id ~ '^prod_[A-Za-z0-9]+$');
update public.subscription_plans set stripe_product_id = case id
  when 'standard' then 'prod_VJgZmeWKwhskii'
  when 'pro' then 'prod_VJgaJIW9lhsCI3'
  when 'cowork' then 'prod_VJgb11Sgimxies'
  else stripe_product_id
end;
update public.subscription_plans set active = true
where id in ('standard', 'pro', 'cowork');
