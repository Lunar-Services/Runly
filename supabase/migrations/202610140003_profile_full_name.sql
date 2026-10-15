-- Full name is separate from the public display name and may be left blank.
alter table public.profiles add column if not exists full_name text;

do $$ begin
  alter table public.profiles add constraint profiles_full_name_length
    check (full_name is null or char_length(full_name) <= 120);
exception when duplicate_object then null;
end $$;

-- Existing owner RLS applies; sensitive profile columns remain server-owned.
grant update (full_name) on public.profiles to authenticated;

notify pgrst, 'reload schema';
