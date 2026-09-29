-- Remove the historical email-based privilege grant from the auth trigger.
-- Administrator access must be granted explicitly by an operator; an account
-- email address must never be a credential or an authorization rule.
create or replace function private.sync_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  candidate text;
  created_profile uuid;
begin
  if not exists (select 1 from public.profiles where id = new.id) then
    loop
      candidate := (
        array['Charmeleon', 'Cobalt', 'Ember', 'Juniper', 'Nimbus', 'Saffron',
              'Tundra', 'Marble', 'Onyx', 'Aster', 'Harbor', 'Kestrel']
      )[1 + floor(random() * 12)::integer]
        || '-' || (1000 + floor(random() * 9000)::integer)::text;
      begin
        insert into public.profiles(id, display_name)
        values (new.id, candidate)
        returning id into created_profile;
        exit when created_profile is not null;
      exception when unique_violation then
        -- Retry when the generated display name is already in use.
      end;
    end loop;
  end if;

  insert into public.account_roles(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;

revoke all on function private.sync_account() from public,anon,authenticated;
