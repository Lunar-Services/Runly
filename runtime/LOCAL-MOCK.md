# Local runtime playground

Test the editor backend without an OpenAI key, paid subscription, public domain,
TLS certificate, or tunnel. This uses real local Supabase, the real job worker
and WebSocket gateway, and a real Linux Docker sandbox. Only the AI provider is
scripted; it does not reason about arbitrary prompts.

## Start

Use Node 22, pnpm, and Docker Desktop with Linux containers running. Stop any
other Runly dev server first: ports 3000, 4001 and 4002 must be free.

```sh
pnpm install
pnpm dev:mock
```

The first run downloads/builds a Node/Python image, starts local Supabase, applies
migrations, and creates a reusable local fixture project. It does not reset the
database. Open the project URL printed by the launcher and sign in with:

- Email: `runtime-mock@runly.test`
- Password: `Runly-Local-Mock-2026!`

These are deliberately public **local test credentials**, never production
credentials. The editor runtime status shows `LOCAL MOCK`.

The launcher supplies temporary credentials/configuration to its child processes;
it does not rewrite `.env.local`. OpenAI requests go to an authenticated emulator
on localhost, with a synthetic key. Stripe credentials are blanked for this run.

## Try the workflow

1. Switch to Files, Terminal, or Preview; the workspace starts on demand.
2. Send `/mock next` in chat. The scripted provider creates a small Next.js
   App Router site under `mock-next`, including an interactive frontend and a
   real `/api/status` backend route.
3. Select Preview. Runly installs the example app's dependencies in the sandbox,
   starts Next.js on the forwarded preview port, then displays it in the iframe.
   Click **Test backend** on the page to call the API route. Console logs show
   the real app output. In Terminal, `curl http://localhost:3000/api/status`
   calls the same backend route from inside the sandbox.
4. `/mock demo` still creates the dependency-free Node HTTP example. Files are
   restored from the database when a workspace is recreated.

Mock preview ports are allocated dynamically and bound to `127.0.0.1`; they are
not reachable from other computers on the network. The iframe runs with a
restricted sandbox and without access to the Runly app origin. Hosted OpenAI
runtime preview forwarding is not yet implemented.

Scripted chat commands:

| Command                                                      | Behavior                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `/mock next`                                                 | Creates/overwrites the Next.js frontend and API route under `mock-next` |
| `/mock demo`                                                 | Creates/overwrites the sample Node app under `mock-demo`                |
| `/mock write path/to/file` followed by a newline and content | Creates/overwrites a real UTF-8 file                                    |
| `/mock slow`                                                 | Delays a turn so you can test cancellation                              |
| `/mock fail`                                                 | Deliberately fails a turn                                               |
| `/mock disconnect`                                           | Interrupts the provider event stream                                    |

Other prompts return mock-mode help, not generated code.

## Automated end-to-end check

With `pnpm dev:mock` still running, use another terminal:

```sh
pnpm test:mock
```

This signs in through the actual API and tests job dispatch, sandbox startup,
file reads/writes/moves, stale-write rejection, streamed assistant persistence,
PTY output, a real HTTP application and logs, failure/cancellation, and source
snapshot restoration after replacing the container. It refuses a live runtime.
It leaves demo files/messages and a running sandbox for manual inspection.

## Shutdown and safety

Stop the workspace from the editor to snapshot files and remove its container.
Then Ctrl+C the launcher. Normal shutdown disables the fixture entitlement and
restores the previous local runtime policy/provider emergency-stop setting.
Local Supabase and the fixture project remain available. If you exit the launcher
without stopping the workspace, sandbox containers are retained for recovery.

A force kill or power failure can bypass cleanup. The fixture entitlement expires
after 24 hours, but the local runtime policy may remain enabled. Before switching
back to live-provider development, use local Supabase Studio to disable the
`runtime-mock` plan entitlement, disable `runtime_policy.enabled`, and restore
your intended `provider_config.emergency_stop` setting. Inspect retained containers
with `docker ps -a --filter name=runly-mock-`; remove only a specifically identified
test container after saving anything you need. Removing it loses unsnapshotted
files and running processes. Do not run a broad Docker prune.

Containers run unprivileged, with resource limits, a read-only root, temporary
workspace storage, and no host-directory or Docker-socket mounts. They still have
network access. This is a **trusted local development tool**, not a production
security boundary for hostile code. Do not expose these services publicly or
use the fixture account on a deployed database.

Passing these tests does not verify OpenAI account access, hosted-environment
connector compatibility, real model behavior/token accounting, public WSS/TLS,
production load, or browser rendering. Complete the live acceptance checklist
in `README.md` separately before enabling production runtimes.
