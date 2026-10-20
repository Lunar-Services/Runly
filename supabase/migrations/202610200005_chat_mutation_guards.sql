create or replace function public.mutate_workspace_chat(
  p_project uuid,
  p_actor uuid,
  p_chat uuid,
  p_title text default null,
  p_delete boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_chat public.conversations;
  v_title text;
begin
  if p_project is null or p_actor is null or p_chat is null
     or (p_delete and p_title is not null)
     or (p_title is not null and char_length(btrim(p_title)) not between 1 and 80) then
    raise exception 'invalid_chat_update';
  end if;
  select * into v_project from public.projects where id = p_project for update;
  if not found then raise exception 'project_missing'; end if;
  if v_project.status = 'archived' then raise exception 'project_archived'; end if;
  if not exists (
    select 1 from auth.users u where u.id = p_actor and u.email_confirmed_at is not null
  ) or not (
    v_project.owner_id = p_actor
    or (v_project.workspace_id is not null and exists (
      select 1 from public.memberships m
      where m.workspace_id = v_project.workspace_id and m.user_id = p_actor
    ))
  ) then raise exception 'not_authorized'; end if;

  select * into v_chat from public.conversations c
    where c.id = p_chat and c.project_id = p_project for update;
  if p_delete then
    if not found then raise exception 'chat_missing'; end if;
    if exists (
      select 1 from public.runtime_jobs j
      where j.conversation_id = p_chat and j.state in ('queued', 'running')
    ) then raise exception 'chat_busy'; end if;
    delete from public.conversations where id = p_chat;
    insert into public.audit_events(actor_id, project_id, action, metadata)
      values (p_actor, p_project, 'chat.deleted', jsonb_build_object('chat_id', p_chat));
    return jsonb_build_object('id', p_chat, 'deleted', true);
  end if;

  if found then
    if p_title is null then return to_jsonb(v_chat); end if;
    v_title := btrim(p_title);
    update public.conversations set title = v_title where id = p_chat returning * into v_chat;
    insert into public.audit_events(actor_id, project_id, action, metadata)
      values (p_actor, p_project, 'chat.renamed', jsonb_build_object('chat_id', p_chat));
  else
    if p_title is not null then raise exception 'chat_missing'; end if;
    insert into public.conversations(id, project_id, title)
      values (p_chat, p_project, null) returning * into v_chat;
    insert into public.audit_events(actor_id, project_id, action, metadata)
      values (p_actor, p_project, 'chat.created', jsonb_build_object('chat_id', p_chat));
  end if;
  return to_jsonb(v_chat);
end;
$$;
revoke all on function public.mutate_workspace_chat(uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.mutate_workspace_chat(uuid, uuid, uuid, text, boolean)
  to service_role;
