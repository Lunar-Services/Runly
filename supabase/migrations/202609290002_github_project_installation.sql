alter table public.projects add column github_installation_id bigint;
create index projects_github_installation_id_idx on public.projects(github_installation_id) where github_installation_id is not null;
-- Repository bindings are written only by trusted backend routes after GitHub App verification.
revoke update on public.projects from authenticated;
grant update(name,status,updated_at) on public.projects to authenticated;
