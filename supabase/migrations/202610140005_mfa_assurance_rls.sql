-- Honor opted-in MFA for direct PostgREST access as well as application routes.
-- This is intentionally conditional: users without a verified factor keep the
-- existing single-factor behavior; users with one need an AAL2 JWT.
create or replace function private.requires_current_assurance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      (select auth.jwt() ->> 'aal') = 'aal2'
      or not exists (
        select 1
        from auth.mfa_factors as factor
        where factor.user_id = (select auth.uid())
          and factor.status = 'verified'
      )
    );
$$;

revoke all on function private.requires_current_assurance() from public, anon;
grant execute on function private.requires_current_assurance() to authenticated;

-- Restrictive policies compose with existing owner/workspace policies. Wrapping
-- the stable helper in a scalar subquery lets Postgres evaluate it once per
-- statement rather than once per row.
drop policy if exists mfa_assurance_guard on public.profiles;
create policy mfa_assurance_guard on public.profiles
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.workspaces;
create policy mfa_assurance_guard on public.workspaces
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.memberships;
create policy mfa_assurance_guard on public.memberships
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.projects;
create policy mfa_assurance_guard on public.projects
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.project_drafts;
create policy mfa_assurance_guard on public.project_drafts
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.project_versions;
create policy mfa_assurance_guard on public.project_versions
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.conversations;
create policy mfa_assurance_guard on public.conversations
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.messages;
create policy mfa_assurance_guard on public.messages
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.subscription_plans;
create policy mfa_assurance_guard on public.subscription_plans
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.plan_entitlements;
create policy mfa_assurance_guard on public.plan_entitlements
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.subscriptions;
create policy mfa_assurance_guard on public.subscriptions
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.usage_reservations;
create policy mfa_assurance_guard on public.usage_reservations
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.usage_events;
create policy mfa_assurance_guard on public.usage_events
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.legal_documents;
create policy mfa_assurance_guard on public.legal_documents
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.legal_versions;
create policy mfa_assurance_guard on public.legal_versions
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.legal_acceptances;
create policy mfa_assurance_guard on public.legal_acceptances
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.github_connections;
create policy mfa_assurance_guard on public.github_connections
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.topup_ledger;
create policy mfa_assurance_guard on public.topup_ledger
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.platform_owners;
create policy mfa_assurance_guard on public.platform_owners
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.account_roles;
create policy mfa_assurance_guard on public.account_roles
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

drop policy if exists mfa_assurance_guard on public.account_deletion_requests;
create policy mfa_assurance_guard on public.account_deletion_requests
  as restrictive for all to authenticated
  using ((select private.requires_current_assurance()))
  with check ((select private.requires_current_assurance()));

-- This security-definer RPC is explicitly granted to authenticated callers and
-- does not run under the table policies above.
create or replace function public.project_usage_summary(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.projects;
  ent public.plan_entitlements;
  plan public.subscription_plans;
  used3 bigint := 0;
  used7 bigint := 0;
  reserved3 bigint := 0;
  reserved7 bigint := 0;
begin
  if not private.requires_current_assurance() then
    raise exception 'not_authorized';
  end if;

  select * into p from public.projects where id = p_project;
  if not found or auth.uid() is null or not (
    p.owner_id = auth.uid()
    or exists (
      select 1 from public.memberships
      where workspace_id = p.workspace_id and user_id = auth.uid()
    )
  ) then
    raise exception 'not_authorized';
  end if;

  select * into ent from public.plan_entitlements
  where active and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and ((p.workspace_id is null and user_id = p.owner_id) or workspace_id = p.workspace_id)
  order by starts_at desc limit 1;
  if not found then return jsonb_build_object('active', false); end if;

  select * into plan from public.subscription_plans where id = ent.plan_id;
  select
    coalesce(sum(input_tokens + output_tokens) filter (where created_at > now() - interval '3 hours'), 0),
    coalesce(sum(input_tokens + output_tokens), 0)
  into used3, used7 from public.usage_events
  where created_at > now() - interval '7 days'
    and (user_id = ent.user_id or workspace_id = ent.workspace_id);
  select
    coalesce(sum(reserved_tokens) filter (where created_at > now() - interval '3 hours'), 0),
    coalesce(sum(reserved_tokens), 0)
  into reserved3, reserved7 from public.usage_reservations
  where status = 'reserved'
    and created_at > now() - interval '7 days'
    and (user_id = ent.user_id or workspace_id = ent.workspace_id);

  return jsonb_build_object(
    'active', true, 'plan', plan.name,
    'threeHour', jsonb_build_object('used', used3, 'reserved', reserved3, 'limit', plan.window_3h_tokens),
    'sevenDay', jsonb_build_object('used', used7, 'reserved', reserved7, 'limit', plan.window_7d_tokens)
  );
end;
$$;

revoke all on function public.project_usage_summary(uuid) from public, anon;
grant execute on function public.project_usage_summary(uuid) to authenticated;
