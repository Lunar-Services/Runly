# Runly AI

Runly is a production-oriented foundation for an AI website and app builder. This repository includes the public experience, account UI, project workspace, Cowork/admin/legal surfaces, Supabase SSR wiring, a deny-by-default schema, and a quota-gated server AI endpoint.

The UI uses the supplied Vida screenshot as a composition reference—editorial headline, monochrome canvas, restrained controls, and one characterful visual—while using Runly’s own mark, content, product structure, and motion.

## Run locally

Requirements: Node.js 20.19+ or 22.13+ and pnpm 10+. The pinned local runtime is listed in `.nvmrc`.

```bash
corepack enable
pnpm install --frozen-lockfile
copy .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`. The design and static product surfaces work without credentials. Authentication and AI correctly remain in “not configured” states.

## Configure Supabase

1. Create a Supabase project.
2. Apply `supabase/migrations/202609220001_initial_secure_schema.sql` in a disposable environment first.
3. Run Supabase database/security advisors and the RLS test suite before production.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local`.
5. Enable email auth and GitHub OAuth as desired. Add `http://localhost:3000/auth/callback` and the production callback URL to the allowlist.
6. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. The current web path does not require it.

The migration explicitly revokes table privileges before granting a narrow authenticated set. RLS is enabled on every public table. Authorization helpers that must inspect protected rows live in a non-exposed `private` schema.

The Supabase CLI could not install its Windows binary in this workspace, so the migration has **not** been executed or advisor-tested here.

## Configure OpenAI later

Add `OPENAI_API_KEY` and an account-accessible `OPENAI_MODEL` to `.env.local`. The `/api/ai/chat` route refuses requests until both exist, validates the authenticated Supabase user, validates input with Zod, atomically reserves usage, calls the provider from the server, and settles or releases the reservation.

Before enabling it in production:

- deploy and test the migration under simultaneous last-token requests;
- add project-context retrieval and structured file-operation validation;
- add provider cost ceilings, streaming reconciliation, cancellation, and stuck-reservation cleanup;
- confirm the selected model with the actual OpenAI project;
- never put `OPENAI_API_KEY` in a `NEXT_PUBLIC_` variable.

## External systems still required

- Stripe products/prices, Checkout, Portal, and verified webhook handlers.
- A GitHub App with selected-repository access, CSRF-safe callback state, conditional expected-SHA writes, and revocation checks.
- An isolated build worker on a separate origin with non-root containers, resource/time limits, egress restrictions, dependency controls, and no production credentials.
- Server-side encryption/KMS for admin-pasted provider credentials plus step-up authentication and audit alerts.
- Email delivery for invitations and account flows.
- Hosting, monitoring, backup/restore, retention, export, and deletion operations.
- Qualified legal review and completion of every bracketed field in `content/legal`.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm build
npx -p @google/design.md designmd lint DESIGN.md
```

## Implementation status

| Capability | Status | Evidence / limitation |
|---|---|---|
| Vida-referenced responsive landing page | Implemented | Real Runly assets, prompt persistence, reduced-motion handling |
| Signup/login UI | Implemented, setup-gated | Supabase email + GitHub OAuth client wiring; needs project credentials |
| Dashboard/projects/settings | UI foundation | Honest empty/setup states; CRUD persistence not yet connected |
| Responsive project workspace | UI foundation | Chat/files/preview surfaces; Monaco and sandbox worker not connected |
| Cowork | UI foundation | Realtime, invitations, roles, and billing require integration |
| Admin provider manager | UI foundation | Secret controls deliberately disabled until KMS/step-up auth exists |
| Legal pages | Implemented as drafts | Full supplied draft text rendered; publication blockers retained |
| Supabase schema and RLS | Implemented, not executed | All required core tables included; must run migration/advisor/RLS tests |
| Atomic quota reservation | Implemented, not integration-tested | Dual 3h/7d checks and idempotent reservation function |
| OpenAI route | Implemented, not live-tested | Server-only, auth + quota-gated; no API key was supplied |
| GitHub repository flow | Not implemented | Requires GitHub App credentials and callback configuration |
| Stripe billing | Not implemented | Requires Stripe account, price IDs, webhook and policy decisions |
| Isolated preview worker | Not implemented | Must be a separate hardened execution service |
| Security headers | Implemented | CSP, frame denial, nosniff, referrer and permissions policy; HSTS in production |
| Production security review | Not performed | Threat model, dependency scanning, penetration testing, and independent review required |

No feature in this table should be treated as production-verified unless its row explicitly says it was tested.
