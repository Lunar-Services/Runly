-- The gateway persists only the digest of each random preview capability.
-- Existing workspaces acquire a token when next started; no files are removed.
alter table public.project_runtimes
  add column if not exists preview_token_hash text
  check (preview_token_hash is null or preview_token_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists project_runtimes_preview_token
  on public.project_runtimes (preview_token_hash)
  where preview_token_hash is not null;

notify pgrst, 'reload schema';
