-- Browser credentials may read project data through RLS, but state changes
-- must pass through the authenticated server routes and their admission checks.
-- In particular, messages are created atomically with agent jobs by the
-- service-role queue RPC; direct inserts would bypass billing and rate limits.
revoke insert, update, delete on public.projects from authenticated;
revoke update (name, status, updated_at) on public.projects from authenticated;
revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.messages from authenticated;
