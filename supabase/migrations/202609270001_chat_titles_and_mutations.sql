alter table public.conversations
  add column title text
  check (title is null or char_length(btrim(title)) between 1 and 80);

create policy conversations_update
on public.conversations
for update
to authenticated
using (private.can_access_project(project_id))
with check (private.can_access_project(project_id));

create policy conversations_delete
on public.conversations
for delete
to authenticated
using (private.can_access_project(project_id));
