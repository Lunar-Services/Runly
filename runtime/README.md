# Runly project runtime

**Local testing without provider credentials:** run `pnpm dev:mock`. See
[the local playground guide](LOCAL-MOCK.md) for setup, fixture login, scripted
agent commands, and the real Docker/terminal end-to-end smoke test.

The Explorer, coding agent, interactive terminal, and application logs share
`/workspace/project` in one OpenAI-hosted environment per project. Project chats
share this filesystem and provider session; they are **not private from other
members of the same project**.

## Status and boundaries

The implementation uses the current [OpenAI Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview)
and [hosted environment setup](https://developers.openai.com/api/docs/guides/agents-api/environments/openai-hosted).
Its terminal/file connector is custom Python code started by `setup_commands`.
OpenAI's documentation does not promise that this particular background-process
and outbound WebSocket arrangement will work in every hosted configuration.
**Run the live acceptance checklist below before enabling this for customers.**

Local tests exercise real Linux PTYs, file operations, the WebSocket gateway with
a mocked control plane, and transactions against local Supabase. They do not
prove hosted connector compatibility, provider account access, or production load.

Current deliberate limits:

- 1,000 source entries, 1 MiB per UTF-8 file, 8 MiB total. Binary/oversize source
  files block snapshots and shutdown with a visible warning instead of being
  silently discarded. Use object storage for large/binary assets. Ignored build,
  dependency and Git directories are ephemeral and must be reproducible.
- File rename/move/create/delete are real; folder deletion is intentionally not
  recursive. Explorer editing is paused during agent work. The shared terminal
  is a single shell, not one shell per collaborator.
- Local mock mode publishes an app port on the host loopback and renders it in a
  sandboxed, cross-origin iframe. Hosted provider previews still require a
  separately isolated preview origin and authenticated HTTP/WebSocket forwarding.
  Never serve untrusted app HTML from the Runly application origin.
- Logs are bounded in-memory tails, not durable audit logs. Saved files,
  messages, jobs and reported token usage are durable in Postgres.
- Hosted expiry is provider-controlled. A live terminal WebSocket is not a
  documented provider keepalive. File snapshots are continuously backed up;
  restoring an expired/disconnected environment currently requires operator
  recovery, not automatic replacement of potentially unsaved work.

## Processes and scaling

1. **Next.js** authenticates verified users, checks project access and billing,
   reserves usage, atomically saves user messages and enqueues jobs, and issues
   60-second signed gateway tickets. No long-running provider call occupies a
   Next.js request.
2. **Gateway/worker** owns live sockets and processes a durable Postgres queue.
   There is one leased process per stable gateway/shard ID. Projects keep their
   assigned gateway when more shards are added. A database uniqueness constraint
   serializes jobs per project; different projects run concurrently.
3. **Hosted connector** accepts commands over outbound WSS and runs them only
   inside its sandbox. It sends source-file deltas, PTY bytes and application logs.
   No OpenAI API key or Supabase service-role key is installed in the sandbox.

Scaling: add a gateway with its own stable ID, public WSS address and capacity.
Use the same `RUNLY_RUNTIME_GATEWAYS` list in Next.js and all gateways. Do not
remove or rename a gateway while projects remain assigned to it. Existing
projects are not rebalanced automatically. Frontend replicas can scale separately.
No Redis is required for this bounded sharded deployment. Load-test before
raising caps; Postgres stores source snapshots rather than an unlimited artifact
store. Adding/removing WSS origins requires rebuilding Next.js's CSP headers.

## Configuration

Use Node 22.13+ within the repository's supported Node range, and pnpm 10.
Production deployment can use the ignored `.env.prod` template at the repository
root; fill it with production credentials and keep it only on the VPS. The
`build:prod`, `start:prod`, and `runtime:prod` scripts load `.env.prod` before
starting the relevant process. See `.env.example` for the complete variable
inventory.

```dotenv
OPENAI_API_KEY=<project-scoped-provider-key>
OPENAI_MODEL=<Agents-API-compatible-model-available-to-your-account>
RUNLY_RUNTIME_SECRET=<at-least-32-random-characters>
RUNLY_RUNTIME_GATEWAYS=[{"id":"primary","url":"wss://runtime.your-domain.example"}]
RUNLY_RUNTIME_GATEWAY_ID=primary
RUNLY_RUNTIME_PORT=4001
RUNLY_RUNTIME_MAX_ACTIVE=10
RUNLY_RUNTIME_IDLE_MINUTES=5
RUNLY_AGENT_TIMEOUT_MINUTES=10
RUNLY_SITE_URL=https://your-app.example
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
```

Generate the shared secret locally with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Do not paste it into chat or commit it. Gateway and Next.js must agree on it.
Configure provider project spending controls and alerts separately: token
reservations/timeouts are **not a hard monetary cap**, and sandbox runtime has
separate costs. The existing `daily_spend_limit_cents` is not used to price sandbox
compute. `runtime_policy` provides global daily task/start admission limits.

### Local development

1. Configure `.env.local` with the runtime/OpenAI settings. Expose local port 4001
   through a trusted TLS tunnel and put its public WSS URL in the gateway list.
   `localhost` is not reachable from a hosted sandbox.
2. Run `pnpm dev:runtime`. This starts/migrates local Supabase, starts Next.js and
   the gateway with **the same local database credentials**, and explicitly
   enables external API calls. Ordinary `pnpm dev` disables OpenAI and does not
   launch the gateway. `dev:runtime` also opts into configured Stripe services;
   use only Stripe test credentials locally.
3. The migration defaults `runtime_policy.enabled` to false. After reviewing
   cost limits, an operator can run in the **intended database**:

   ```sql
   update public.runtime_policy set enabled=true where id=true;
   ```

   If `provider_config.emergency_stop` is true, it must also be cleared through
   your admin process. Do not bypass it in application code. The project owner
   (or workspace) needs an active `plan_entitlements` row. Runtime enablement
   does not create a subscription or grant free usage.

4. Open a project and switch to Files or Terminal; the server starts its
   workspace on demand and stops it after five minutes without user activity.
   Use the **Import browser files** button in Files mode to bring over old
   localStorage files; conflicting files are not overwritten and the browser
   backup remains.
5. Edit files, send an agent request, open Terminal, or choose Console and run
   e.g. `npm run dev`. Output appears in the same project's Console panel.

### Production / single VPS

Apply migrations through the repository's reviewed production migration process;
do not use `db reset`. Run `pnpm build:prod` once for Next.js. Run separate,
supervised `pnpm start:prod` and `pnpm runtime:prod` processes. `pnpm
runtime:local-env` is an explicit convenience for reading `.env.local`; it does
not substitute local Supabase credentials.

TLS proxy example for this deployment (Caddy obtains certificates and proxies
WebSocket upgrades):

```caddyfile
runly-ai.xyz {
    reverse_proxy 127.0.0.1:3000
}
runtime.runly-ai.xyz {
    reverse_proxy 127.0.0.1:4001
}
*.preview.runly-ai.xyz {
    # Install a wildcard certificate for *.preview.runly-ai.xyz, issued with DNS-01.
    tls /etc/caddy/certs/runly-preview.crt /etc/caddy/certs/runly-preview.key
    reverse_proxy 127.0.0.1:4001
}
```

Create DNS A/AAAA records for `runly-ai.xyz`, `runtime.runly-ai.xyz`, and the
wildcard `*.preview.runly-ai.xyz` to the VPS; optionally point `www` to the apex.
The preview wildcard certificate must be issued using DNS-01 (a regular HTTP
challenge cannot issue a wildcard certificate). Restrict ports 3000/4001 to
loopback and expose only 80/443 through the firewall. Add edge connection/rate limits.
Health responds 503 until the gateway holds its database lease. Restart backoff
should allow its 45-second lease to expire. Keep service credentials out of
access logs. No Docker socket or host filesystem is exposed to project code.

Before enabling the runtime for users, apply all Supabase migrations, configure
the Supabase Auth site URL and redirect allowlist for `https://runly-ai.xyz`,
provision active plan entitlements, and explicitly enable `runtime_policy` only
after reviewing quotas and provider spending limits. Start Next.js and the
gateway as separate supervised services. Set `RUNLY_PREVIEW_DOMAIN=preview.runly-ai.xyz`
in `.env.prod`, apply the runtime migrations (including the preview-token column),
and configure DNS plus a valid wildcard TLS certificate before enabling Preview.
The gateway relays bounded HTTP/1.1 request/response bodies (1 MiB request,
8 MiB response) over the sandbox's existing WSS connection; it does not expose
the sandbox port directly. WebSocket upgrades (including development HMR) are
not yet tunneled, so use a production-style app server or refresh manually while
developing. The `preview.runly-ai.xyz` subdomain is cross-origin but same-site
with `runly-ai.xyz`; it is not a separate registrable-site security boundary.

## Safety and failure behavior

- RLS and revoked grants prevent clients from writing runtime tables or calling
  privileged queue/usage functions. Gateway tickets bind user/project/shard,
  browsers need the configured Origin, and access is periodically rechecked.
- A sandbox's rotating connector token only authorizes that project's current
  generation. Project code can access its own sandbox credentials; do not treat
  that token as a secret from project collaborators or give it platform privileges.
- Source saves use hashes to reject stale writes. Acknowledgements wait for the
  database backup. Shutdown takes and backs up a full snapshot first. Keep a
  workspace open if backup fails, and fix the cause before retrying shutdown.
- Agent tasks use idempotency keys, leases, timeouts, cancellation and a bounded
  queue. Uncertain submissions are not automatically replayed. Queued tasks
  recheck access and compute policy before execution.
- Usage is reserved per entitlement before admission, and reported tokens are
  settled idempotently. Tasks never submitted to the provider release their
  reservation. Uncertain submissions retain it until reconciled.
- Treat every generated/run command as project-user code with network access.
  The sandbox is the execution boundary; this is not an approval-based command
  allowlist. Do not put platform credentials or unrelated customer data there.

### Recovery

For a failed task with known provider turn ID, run with the same injected env:

```sh
node --import tsx runtime/reconcile.ts <job-uuid>
```

If the stream disconnected before saving the turn ID, inspect the provider
session first, match its turn to the job, then pass that turn ID as the second
argument. The tool never resubmits input. It requires terminal provider status
and reported usage, recovers a completed answer, and settles usage. Inspect the
filesystem before continuing. If no provider turn exists, operator investigation
is required; do not blindly release the reservation or replay the request.

If the hosted environment has permanently expired, export/recover anything
available from the provider and compare it with `runtime_files` before deleting
the old provider session and clearing that project's `session_id`, connector
token and state. This deliberately is not automatic: a disconnected sandbox may
contain the only remaining copy of recent edits. Alert on stalled jobs, failed
backups, disconnected sessions and held reservations.

## Verification

```sh
pnpm test:runtime
python -B -m unittest discover -s runtime -p 'test_*.py' -v
pnpm lint
pnpm typecheck
pnpm build
```

Linux-only PTY/symlink tests can run in a disposable container with the `runtime`
folder mounted read-only, no network, and `python:3.12-slim`.
`control-plane.test.sql` runs transactionally and rolls back its fixtures. For
this repo's **local** Supabase container, PowerShell:

```powershell
Get-Content -Raw runtime/control-plane.test.sql | docker exec -i supabase_db_runly-local psql -U postgres -d postgres
```

Live acceptance (not replaced by mocked tests): start a real hosted sandbox;
verify connector startup and outbound WSS; create/edit/move a file; ask the agent
to modify it; verify Explorer and `cat` see identical content; run an app and
check logs; cancel a task and check usage; reconnect browser/gateway; stop and
restart the workspace and compare files; test expired credentials, membership
revocation, snapshot failure and idle shutdown. Only then enable customer traffic.

### Chat media

The Media button accepts JPEG, PNG, WebP, GIF, MP4, WebM, and supported audio files. Voice records up to 90 seconds. Limits are 5 MB per image and 20 MB for audio/video, with four attachments per message. The picker validates audio/video clips up to two minutes.

Uploads use the private `runly-chat-media` Supabase Storage bucket, created by the authenticated server on first upload. Keep it private; do not add public read or anonymous upload policies. The server issues signed upload/read URLs after checking project access. Service-role credentials remain on the server and worker.

The worker needs `OPENAI_API_KEY` as usual. Images use Agents vision inputs; video uses six chronological sampled frames (without its soundtrack). Audio and voice use `gpt-4o-mini-transcribe`; transcription tokens are included in the usage ledger. Draft uploads that are abandoned remain private; apply storage retention cleanup according to your policy.
