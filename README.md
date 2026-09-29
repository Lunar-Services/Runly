# Runly AI

Runly is a production-oriented foundation for an AI website and app builder. This repository includes the public experience, account UI, project workspace, Cowork/admin/legal surfaces, Supabase SSR wiring, a deny-by-default schema, and a quota-gated server AI endpoint.

The UI uses the supplied Vida screenshot as a composition reference—editorial headline, monochrome canvas, restrained controls, and one characterful visual—while using Runly’s own mark, content, product structure, and motion.

## Onboarding

### 1. First-time setup

Requirements: Node.js 20.19+ (or 22.13+), pnpm 10+, and Docker Desktop for the local database.

```bash
corepack enable
pnpm install --frozen-lockfile
copy .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
```

Keep server secrets in `.env.local` only. Normal local development intentionally disables Stripe and OpenAI.

### 2. Everyday commands

| Command             | Use it when                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Start the app with an isolated local Supabase database. Recommended for UI and auth work.                   |
| `pnpm dev:stripe`   | Start local development with Stripe test-mode keys enabled. Use for Checkout, billing, and webhook testing. |
| `pnpm build`        | Create a production build and catch build-time errors.                                                      |
| `pnpm start`        | Serve the last production build locally. Run `pnpm build` first.                                            |
| `pnpm lint`         | Check ESLint rules.                                                                                         |
| `pnpm typecheck`    | Check TypeScript types.                                                                                     |
| `pnpm verify`       | Run lint, typecheck, and build together. Use before opening a PR.                                           |
| `pnpm check`        | Run staged formatting/lint/security checks locally. Used by the pre-commit hook.                            |
| `pnpm format`       | Auto-format the repository with Prettier.                                                                   |
| `pnpm format:check` | Verify formatting without changing files.                                                                   |

### 3. Local database commands

Docker Desktop must be running before database commands.

| Command              | Use it when                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| `pnpm migrate`       | Start local Supabase and apply repository migrations.                                   |
| `pnpm db:reset`      | Rebuild the local database from the migration files. This removes local data.           |
| `pnpm db:stop`       | Stop the local Supabase containers.                                                     |
| `pnpm migrate --dev` | Push migrations to the linked remote Supabase project. Review the target project first. |

`pnpm dev` starts and migrates the local database automatically. Migrations are the source of truth; `pnpm db:reset` does not restore from Git history unless the current checkout contains those migration files.

### 4. Stripe test setup

Use Stripe test mode only for local development:

1. Add `STRIPE_SECRET_KEY=sk_test_...` to `.env.local`.
2. Start the app with `pnpm dev:stripe`.
3. In another terminal, run:

```bash
npm i -g @stripe/cli@latest
stripe login
stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,invoice.payment_failed --forward-to http://localhost:3000/api/stripe/webhook
```

4. Copy the CLI `whsec_...` value into `STRIPE_WEBHOOK_SECRET`, then restart `pnpm dev:stripe`.
5. Register active monthly USD Prices in **Admin → Billing**. The Product, Price, and `sk_test_...` key must belong to the same Stripe test account.

Do not put Stripe secret keys in `NEXT_PUBLIC_` variables or use live keys locally. Production uses the real server environment variables and a Stripe Dashboard webhook endpoint.

### 5. Recommended workflows

| Goal                     | Commands                                |
| ------------------------ | --------------------------------------- |
| Start normal development | `pnpm dev`                              |
| Test Stripe locally      | `pnpm dev:stripe` + `stripe listen ...` |
| Test a clean schema      | `pnpm db:reset`                         |
| Validate before pushing  | `pnpm verify`                           |
| Run production locally   | `pnpm build` then `pnpm start`          |

## Run locally

Requirements: Node.js 20.19+ or 22.13+, pnpm 10+, and Docker Desktop. The pinned local runtime is listed in `.nvmrc`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

`pnpm dev` starts the isolated local Supabase Docker stack, applies local migrations, and then starts Next.js. It overrides any remote Supabase values in `.env.local` with the local URL, publishable key, and service-role key. It also disables Stripe and OpenAI keys by default, so normal local development cannot call paid production services.

Start Docker Desktop first, then run `pnpm dev`. The app is available at `http://localhost:3000`; local Supabase Studio is available at `http://localhost:54323`, and local test emails appear in Inbucket at `http://localhost:54324`.

Copy `.env.example` to `.env.local` only when you need optional local configuration. For an intentional Stripe **test-mode** checkout or webhook test, add your `sk_test_...` Stripe secret key and the CLI's `whsec_...` signing secret, then use `pnpm dev:stripe`. This enables Stripe only; OpenAI remains disabled. Never add live Stripe keys to local development.

Open `http://localhost:3000`. The design and static product surfaces work without credentials. Authentication and AI correctly remain in “not configured” states.

## Configure Supabase

1. Create a Supabase project.
2. Apply every migration in `supabase/migrations/` in chronological order, beginning with `20260923112857_initial_secure_schema.sql`, in a disposable environment first.
3. Run Supabase database/security advisors and the RLS test suite before production.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to `.env.local`.
5. Enable email auth and GitHub OAuth as desired. Add `http://localhost:3000/auth/callback` and the production callback URL to the allowlist.
6. Set `SUPABASE_SERVICE_ROLE_KEY` only on the server. It is required by the verified billing webhook and profile image endpoint; it must never be prefixed with `NEXT_PUBLIC_`.

The migration explicitly revokes table privileges before granting a narrow authenticated set. RLS is enabled on every public table. Authorization helpers that must inspect protected rows live in a non-exposed `private` schema.

The Supabase CLI could not install its Windows binary in this workspace, so the migrations have **not** been executed or advisor-tested here.

### Apply migrations

For the local Docker database, migrations are applied automatically by `pnpm dev`. You can also run them without starting the app:

```bash
pnpm migrate
```

Useful local commands:

```bash
pnpm db:reset # rebuild the local database from migrations
pnpm db:stop  # stop local Supabase containers
```

To migrate the linked Supabase project (for example, your shared development project), link it once and use the explicit remote switch:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref your-project-ref
pnpm migrate --dev
```

`pnpm migrate --dev` runs `supabase db push`. It changes the linked remote database, so run it against shared development before production and never point it at an unintended project.

## Configure Stripe billing

1. In Stripe, keep exactly one **active USD monthly recurring Price** on each supported Product: Standard (`prod_VJgZmeWKwhskii`), Pro (`prod_VJgaJIW9lhsCI3`), and Cowork (`prod_VJgb11Sgimxies`). Runly retrieves the Price on the server and refuses Checkout when a Product has zero or more than one matching Price.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `RUNLY_SITE_URL` in the production server environment. Do not expose any of them to the browser.
3. Create a Stripe webhook endpoint at `https://your-domain.example/api/stripe/webhook` and subscribe it to `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, and `invoice.payment_failed`. These signed events, not the Checkout return URL, control account access.
4. Enable and configure the Stripe Customer Portal for these Prices. Signed-in users can then use **Manage billing** at `/settings/billing` for plan changes, cancellation, and payment methods.
5. Test with Stripe’s test mode (or Stripe CLI) before going live: Checkout completion, renewal, cancellation, failed payment, and plan change must each update `/settings/billing` after the corresponding webhook is delivered.

### Webhook outage recovery

Stripe retries failed webhook deliveries, but production also needs an independent recovery path. Set a high-entropy `RUNLY_BILLING_RECONCILIATION_SECRET` (or Vercel's `CRON_SECRET`) and configure your hosting scheduler to call the following endpoint every minute, with retries on non-2xx responses:

```text
GET https://your-domain.example/api/internal/stripe-reconcile
Authorization: Bearer <RUNLY_BILLING_RECONCILIATION_SECRET>
```

The job claims only due checkout attempts and subscriptions in bounded batches with database row locks, then pulls the corresponding Stripe objects and persists their real status and period end. It accepts no customer or user ID and never sweeps every Stripe Customer. New checkouts retry quickly with jittered exponential backoff; problematic subscriptions retry more often; healthy subscriptions reconcile near renewal; terminal subscriptions stop scheduled checks. If Stripe is unreachable for a due protected entitlement, access fails closed until Stripe can be confirmed.

### Test webhooks locally with Stripe CLI

Keep normal development isolated with `pnpm dev`. For an explicit Stripe test-mode session:

```bash
# Terminal 1: starts local Supabase and Runly with Stripe enabled.
pnpm dev:stripe

# Terminal 2: authenticates once, then forwards Stripe test events locally.
stripe login
stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,invoice.payment_failed --forward-to http://localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` value printed by `stripe listen` into `STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart `pnpm dev:stripe`. The Stripe CLI provides the local forwarding connection; no additional tunnel is needed. Use test Products, Prices, and an `sk_test_...` key—never live credentials.

The integration maps the three application plan names to the Product IDs in server code. The browser submits only an allowed plan name; it cannot supply a Price, Stripe Customer, or application user ID. Stripe customers are mapped one-to-one with application users in the database, webhook signatures are verified from the raw request body, and event claims are stored to make retries idempotent.

## Roles and product catalog

Supabase's `authenticated` role is only its database login role. Runly assigns every account the application role `user`; only the application role `admin` can open `/admin` and its protected APIs. After applying the role migration, bootstrap the first administrator in the Supabase SQL editor (replace the email):

```sql
update public.account_roles set role = 'admin'
where user_id = (select id from auth.users where email = 'you@example.com');
```

An administrator can register or edit sellable plans at `/admin/billing`. Enter a plan ID, display name, Product ID, monthly Price ID, allowance limits, and active state. The server retrieves the Price with the Stripe secret key and only saves it when it belongs to the specified Product and is active, USD, and monthly recurring.

## Configure OpenAI later

Add `OPENAI_API_KEY` and an account-accessible `OPENAI_MODEL` to `.env.local`. The `/api/ai/chat` route refuses requests until both exist, validates the authenticated Supabase user, validates input with Zod, atomically reserves usage, calls the provider from the server, and settles or releases the reservation.

Before enabling it in production:

- deploy and test the migration under simultaneous last-token requests;
- add project-context retrieval and structured file-operation validation;
- add provider cost ceilings, streaming reconciliation, cancellation, and stuck-reservation cleanup;
- confirm the selected model with the actual OpenAI project;
- never put `OPENAI_API_KEY` in a `NEXT_PUBLIC_` variable.

## External systems still required

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

| Capability                              | Status                              | Evidence / limitation                                                                                           |
| --------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Vida-referenced responsive landing page | Implemented                         | Real Runly assets, prompt persistence, reduced-motion handling                                                  |
| Signup/login UI                         | Implemented, setup-gated            | Supabase email + GitHub OAuth client wiring; needs project credentials                                          |
| Profile settings                        | Implemented, setup-gated            | Display name + private JPEG/PNG/WebP avatar upload, replacement, removal, and persistence via Supabase          |
| Responsive project workspace            | UI foundation                       | Chat/files/preview surfaces; Monaco and sandbox worker not connected                                            |
| Cowork                                  | UI foundation                       | Realtime, invitations, roles, and billing require integration                                                   |
| Admin provider manager                  | UI foundation                       | Secret controls deliberately disabled until KMS/step-up auth exists                                             |
| Legal pages                             | Implemented as drafts               | Full supplied draft text rendered; publication blockers retained                                                |
| Supabase schema and RLS                 | Implemented, not executed           | All required core tables included; must run migration/advisor/RLS tests                                         |
| Atomic quota reservation                | Implemented, not integration-tested | Dual 3h/7d checks and idempotent reservation function                                                           |
| OpenAI route                            | Implemented, not live-tested        | Server-only, auth + quota-gated; no API key was supplied                                                        |
| GitHub repository flow                  | Not implemented                     | Requires GitHub App credentials and callback configuration                                                      |
| Stripe billing                          | Implemented, requires Stripe setup  | Server-selected monthly Prices, Checkout, Portal, verified idempotent webhooks, and persisted entitlement state |
| Isolated preview worker                 | Not implemented                     | Must be a separate hardened execution service                                                                   |
| Security headers                        | Implemented                         | CSP, frame denial, nosniff, referrer and permissions policy; HSTS in production                                 |
| Production security review              | Not performed                       | Threat model, dependency scanning, penetration testing, and independent review required                         |

No feature in this table should be treated as production-verified unless its row explicitly says it was tested.
