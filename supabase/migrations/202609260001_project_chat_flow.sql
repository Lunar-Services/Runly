create policy conversations_insert
on public.conversations
for insert
to authenticated
with check (private.can_access_project(project_id));

create policy messages_insert_user
on public.messages
for insert
to authenticated
with check (
  role = 'user'
  and actor_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and private.can_access_project(c.project_id)
  )
);
