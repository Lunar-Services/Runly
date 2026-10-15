# Frontend branch and deployment review — 2026-10-14

## Branch integration

The checked-out branch is `frontend-design`. `origin/main` was fetched at
`a5cbe31`; local `main` matches it. Running `git merge origin/main` reported
"Already up to date." The original branch HEAD is `d48e234`. No merge conflict
or merge commit was necessary, and the branch's landing design was retained.

The original branch comparison contains 15 changed paths. Its visual redesign
is concentrated in `landing-page.tsx`, `landing.css`, three new marketing
images, and `brand.tsx`. Project attachments and pending-build persistence are
functional changes, not a redesign of the rest of the application.

## Page coverage

### Customer phase update

The subsequent customer-page phase refactored Profile, Security,
Notifications, Billing & plan, plan selection, and public pricing. It added
Create, How it works, Explore, and dedicated password, subscription, payment,
billing-details, and deletion-request destinations. These pages share the
landing navbar, imported Figma mark, and a scoped account layout. The two
requested Luna reviewers checked usability and visual restraint. The original
coverage table below describes the branch **before this customer phase**.
See [deploy/customer-pages.md](deploy/customer-pages.md) for current behavior
and deployment requirements. Workspace/editor UI remains outside this phase.

Profile name/photo editing and JSON metadata export use authenticated APIs.
Notifications persist four preferences; outbound notification delivery is
still unimplemented. Authenticator setup is backed by Supabase TOTP and an
enforced sign-in/recovery challenge, API assurance checks, and restrictive
RLS for enrolled accounts. Account deletion is a cancellable operator request,
not automatic erasure. Live Stripe payment, billing details, invoice, and plan
data replace illustrative Figma samples. Hosted TOTP/Stripe portal settings
must be enabled by the operator.

"Not refactored" means the page layout/style was inherited from `main` before
this maintenance pass. All pages using `Brand` inherit the updated wordmark.

| Page                       | Routes                                                                            | Refactor coverage                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Landing                    | `/`                                                                               | **Refactored**: cloud hero, composer, attachment chooser, feature/workflow sections, navigation and footer |
| Authentication             | `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`       | **Not refactored**; existing auth layouts and cat illustration                                             |
| Account                    | `/settings`                                                                       | **Not refactored**; existing profile and connected-account forms                                           |
| Preferences                | `/settings/preferences`                                                           | **Not refactored**; existing appearance controls                                                           |
| Billing                    | `/settings/billing`                                                               | **Not refactored**; existing subscription and invoice UI                                                   |
| Upgrade plans              | `/settings/billing/upgrade`                                                       | **Not refactored**                                                                                         |
| Public pricing             | `/pricing`                                                                        | **Not refactored**; the new landing navigation does not link to pricing                                    |
| Project list               | `/dashboard/projects`                                                             | **Functional updates only**: pending prompts/files resume after login; layout inherited                    |
| Project editor             | `/project/:uuid`                                                                  | **Not refactored**; existing chat, files, terminal, logs and preview UI                                    |
| Cowork                     | `/cowork`                                                                         | **Not refactored**; disabled team-workspace foundation                                                     |
| Admin                      | `/admin`, `/admin/billing`, `/admin/usage`, `/admin/ai-providers`, `/admin/legal` | **Not refactored**; billing catalog has real APIs, several other panels remain setup surfaces              |
| Legal                      | `/terms`, `/privacy`                                                              | **Not refactored**; canonical pages render full draft documents                                            |
| Planned workspace features | `/plugins`, `/skills`, `/workshop`                                                | **Not refactored**; still "Coming soon"                                                                    |
| Contact                    | `/contact`                                                                        | No implementation existed; removed the broken footer link                                                  |

Account and billing were checked in the browser with the local fixture account.
No dedicated mobile viewport or full accessibility audit was performed in this
pass. The responsive styles and overall visual composition were retained.

## Stale surfaces removed

- Removed the duplicate dashboard renderer and its redundant Overview sidebar
  entry. `/dashboard` redirects to `/dashboard/projects`.
- Removed the unreachable short legal-document renderer from `ProductScreen`.
  `/terms` and `/privacy` keep their full source-document implementation.
- Removed the unlinked, hardcoded "Design Studio" Cowork demo. Its old nested
  workspace URLs now return 404; the current Cowork setup page remains.
- `/project` and the broken `/project/new` URL redirect to the actual project
  creation/list page. The header shortcut points there directly.
- Kept `/settings/account` as a compatibility redirect to `/settings`, preserving
  callback query parameters.
- Replaced broad catch-all acceptance with a finite route map and UUID project
  route shape. Unknown nested URLs return 404 instead of an unrelated old page.
- Removed eight unused marketing component/style files: business motion, code
  card, landing art, subscription comparison, and terminal demo. Removed their
  unused NumberFlow and GSAP dependencies. Shared global styles remain because
  they still serve active authenticated pages and the landing shell.
- Corrected stale project-list helper text, updated outdated README capability
  notes, connected the Explore anchor, and removed the nonexistent Contact link.

## Security and correctness changes

Long chats also returned their oldest 200 messages, hiding newer replies. The
project API now fetches the latest 200 and restores chronological display order.
A disposable 205-message fixture checks that the newest assistant reply is
included. Explicitly named chats skip the redundant title-message query.

| Finding                                                                                                                  | Resolution                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eight production dependency advisories: three high, four moderate, one low                                               | Updated Next.js, `@next/env`, and ESLint's Next config to 16.3.8; pinned patched `sharp` 0.35.5 and `source-map-js` 1.2.2. The production pnpm audit reports zero advisories.                                                   |
| Repeated Enter/click submissions could create multiple projects and agent jobs                                           | Added a synchronous submission lock and busy controls, and aligned the composer with the 12,000-character API limit. Attachment-only submissions are now enabled consistently.                                                  |
| Attachment URLs were generated by the server but their Supabase host was absent from the hosted sandbox egress allowlist | Added the exact configured Supabase host. References remain private objects accessed through signed URLs; service credentials are not sent into the sandbox.                                                                    |
| A valid 12,000-character prompt could exceed the database limit after attachment URLs were appended                      | Validate the combined agent input and return a clear 400 error; uploaded objects and the provisional project are cleaned up on failure.                                                                                         |
| Local schema had recorded an older version of the lifecycle migration without the preview-token column                   | Added an idempotent repair migration and PostgREST schema-cache notification. Fresh databases already containing the original column/index are supported. Reapplying the repair twice was tested transactionally.               |
| Unauthenticated WebSocket frames could enter JSON parsing at the full snapshot payload size                              | Reject authentication frames over 4 KiB; added an integration assertion. The TLS proxy also bounds concurrent runtime/preview connections per IP.                                                                               |
| Container builds could accidentally include local credential/configuration artifacts                                     | Added an allowlist build context. Environment files, keys, certificates, Git history, mock code and local/generated dependencies are excluded. Only public configuration is accepted as web build arguments.                    |
| Base-image packages and package-manager tools enlarged the runtime attack surface                                        | Final images use an updated Alpine runtime; global npm/Yarn/Corepack tooling is removed from web/worker images. Runtime containers are non-root, read-only, resource limited and have no Docker socket or host workspace mount. |

Secret checks covered current tracked files, reachable local Git history, and the
production browser JavaScript copied from the Docker image. The browser check
also compares configured private values from ignored local environment files
without printing those values. No matches were found. Only `.env.example` is
tracked among the root environment files. Pattern scans cannot prove the absence
of every possible secret or inspect unreachable/deleted remote history.

The reviewed server paths retain verified-user checks, admin role checks, Zod
input validation, same-origin mutation checks, bounded bodies, database RLS,
server-selected Stripe prices and signed/idempotent webhooks. Runtime admission,
usage settlement, connection tickets, source path guards and source-write hashes
remain enforced. GitHub installation tokens stay in the trusted Next.js broker;
the production sandbox does not receive them. Bridge tests verify child processes
do not inherit platform API keys.

The Docker proxy blocks `/internal/` routes on both public runtime and preview
hosts. Only ports 80/443 are published. Query strings and preview capability
hostnames are excluded from access logs. The web and worker retain their private
loopback transport through a shared container network namespace.

## Performance changes

- The cloud background changed from a 1,626,973-byte PNG to a 46,460-byte WebP,
  retaining the same image composition and dimensions: about 97% fewer bytes.
- Desktop/mobile workspace illustrations are lazy loaded with explicit sizes,
  instead of both being marked for eager priority loading below the hero.
- The project editor is dynamically imported so public pricing does not eagerly
  load the terminal/editor dependency graph.
- Billing upgrade navigation uses Next.js routing instead of a full page reload.
- The worker is bundled into Node-compatible ESM and ships only the bundles and
  Python connector, rather than the full frontend dependency installation.
  Docker reports about 253 MB for the final worker image, down from the initial
  1.09 GB image that included the frontend dependency tree. Final web/proxy image
  sizes are about 350 MB and 106 MB; shared layers are counted in each image size.
- Health probes avoid authentication/session refresh; logs and temporary storage
  have explicit bounds in Compose, and Next.js cache uses a named volume.

## Validation

| Check                                                            | Result                                                                                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint and TypeScript                                            | Pass                                                                                                                                                                                |
| Production Next.js build in Docker                               | Pass                                                                                                                                                                                |
| Runtime TypeScript suite                                         | 5 tests pass                                                                                                                                                                        |
| Compiled worker gateway integration test inside the worker image | Pass, including authentication, file events, preview HTTP/WebSocket transport, internal HMAC checks and invalid-ticket rejection                                                    |
| Python bridge suite in Linux, without external networking        | 13 tests pass                                                                                                                                                                       |
| Runtime database control-plane assertions                        | Pass, fixtures/policy changes rolled back                                                                                                                                           |
| Local mock end-to-end flow                                       | Pass: API/job dispatch, real Docker sandbox, file lifecycle, stale writes, streamed/persisted assistant response, PTY, app HTTP/logs, failure/cancellation and snapshot restoration |
| HTTP route and API checks                                        | 12 public pages, 12 protected routes, 8 invalid/removed paths, 4 legacy redirects, 3 anonymous API checks and 3 rejected cross-origin mutations pass                                |
| Docker Compose configuration and all three image builds          | Pass                                                                                                                                                                                |
| TLS Compose smoke                                                | Web/worker/proxy healthy; app/pricing/auth/legal/health responses, blocked internal routes, invalid preview and WSS rejection pass                                                  |
| Secret scans                                                     | Current tracked files, reachable Git history and production browser bundle pass                                                                                                     |
| Production package audit                                         | Zero reported advisories                                                                                                                                                            |

TLS smoke tests used a disposable local certificate and synthetic provider key;
the client trusted that fixture CA. The proxy used the fixture owner's non-root
UID because of Windows bind-mount ownership. Production defaults to UID/GID 101
and requires the key permissions documented in `deploy/README.md`.
The production tests made no real OpenAI, Stripe payment or GitHub write calls.

Trivy 0.76.0 reports zero HIGH/CRITICAL findings in the final web, worker and
proxy images. Lower severities are outside this container scan threshold.
[deploy/security-audit.json](deploy/security-audit.json) records the image IDs,
scanner version, scope and results. The final Alpine TLS test also exercised
native image optimization and verified that pricing does not eagerly load the
terminal bundle. The 205-message readback fixture passed and was removed.

## Remaining release work and limits

1. **The requested full UI refactor is incomplete.** Every page marked "Not
   refactored" above needs a separate design implementation. This maintenance
   pass preserves the new landing design and keeps existing functional pages.
2. **Production external-service acceptance remains required.** Local scripted
   provider tests do not prove real hosted environment startup, model access,
   public DNS/TLS, GitHub authorization/writes, Stripe billing events or recovery
   under production outages. Follow the live checklist in `runtime/README.md`.
3. **AI accounting is not a hard monetary cap.** Reservations and timeouts gate
   admission; a submitted turn can consume more than its reserved estimate, and
   sandbox compute has separate costs. Configure provider spending limits,
   alerts and operational recovery before enabling customer runtime policy.
4. **CSP still permits inline scripts.** Existing Next.js bootstrapping uses
   `script-src 'unsafe-inline'`. No raw user-HTML injection sink was found in the
   reviewed UI, but nonce/hash-based CSP is a remaining defense-in-depth task.
5. **Workspace scale is intentionally bounded.** Source snapshots support 1,000
   entries, 1 MiB per UTF-8 file and 8 MiB total. Binary assets are not a general
   source store. One gateway ID belongs to one worker process; adding replicas
   requires separately configured shards and load testing.
   Project chat listing is still unpaginated, and automatic titles for unnamed
   chats read their user-message history. Before large chat volumes, persist the
   first-message title or use a bounded database query, add an index on
   `conversations(project_id, created_at)`, and paginate chat discovery.
6. **Product claims exceed implemented features.** The new landing mentions video
   editing/export and publishing. There is no dedicated video editing/export or
   customer-site publication pipeline in the repository. Cowork, Plugins, Skills
   and Workshop also remain foundations/placeholders. Legal documents are drafts.
7. **Deployment configuration is still required.** Supply real environment
   values, migrations, entitlements, isolated preview DNS/TLS, certificate renewal,
   webhook configuration, the billing reconciliation schedule and monitoring.
   Container images alone do not provision those external services.

Deployment instructions are in [deploy/README.md](deploy/README.md). The preview
is running at `http://localhost:3000` through `pnpm dev:mock`; local fixture login
is `runtime-mock@runly.test` / `Runly-Local-Mock-2026!`. This is a public local
development fixture, not a production account. Use `/mock demo` or `/mock next`
inside project chat to exercise the scripted provider.
