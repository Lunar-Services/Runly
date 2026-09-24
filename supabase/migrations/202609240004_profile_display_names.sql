-- Give every account a friendly, unique name at creation time. The application
-- still lets the owner replace it through the authenticated profile endpoint.

create unique index if not exists profiles_display_name_unique_idx
on public.profiles (lower(display_name))
where display_name is not null and btrim(display_name) <> '';

do $$
declare
  profile_id uuid;
  candidate text;
begin
  -- Existing accounts that predate default names receive one as well.
  for profile_id in
    select id from public.profiles
    where display_name is null or btrim(display_name) = ''
  loop
    loop
      candidate := (
        array['Charmeleon', 'Cobalt', 'Ember', 'Juniper', 'Nimbus', 'Saffron',
              'Tundra', 'Marble', 'Onyx', 'Aster', 'Harbor', 'Kestrel']
      )[1 + floor(random() * 12)::integer]
        || '-' || (1000 + floor(random() * 9000)::integer)::text;
      begin
        update public.profiles
        set display_name = candidate, updated_at = now()
        where id = profile_id;
        exit;
      exception when unique_violation then
        -- Generate another friendly name; the unique index is the race-safe
        -- authority when another signup picks the same candidate.
      end;
    end loop;
  end loop;
end $$;

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
        -- The generated name was taken; retry under the unique-index guard.
      end;
    end loop;
  end if;

  insert into public.account_roles(user_id) values(new.id) on conflict(user_id) do nothing;
  if lower(new.email)='ibrahimfalih7@gmail.com' and new.email_confirmed_at is not null then
    insert into public.platform_owners(user_id) values(new.id) on conflict(user_id) do nothing;
    update public.account_roles set role='admin' where user_id=new.id;
  else
    delete from public.platform_owners where user_id=new.id;
  end if;
  return new;
end $$;
