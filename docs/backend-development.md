# Backend development

## Start the web app and local database

Requirements: the repository's Node 22/pnpm 10 versions and Docker Desktop's
Linux engine. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` starts local Supabase, applies pending migrations without resetting
data, and launches Next.js with the local URL and server credentials. It does
not replace `.env.local` or connect to the hosted Supabase project. Local keys
are captured internally rather than printed. Infrastructure token encryption
uses a stable key stored in ignored `.supabase-local/credential-key`; retain
that file if you need to recover saved local credentials.

| Service            | Address                                |
| ------------------ | -------------------------------------- |
| Perch / web app    | http://localhost:3000                  |
| Supabase API       | http://127.0.0.1:54321                 |
| Supabase Studio    | http://localhost:54323                 |
| Local email inbox  | http://localhost:54324                 |
| Database readiness | http://localhost:3000/api/health/ready |

Use the signup page and read the verification message in the local inbox.
Email delivery stays inside the Docker stack. The existing password flow is
available through the password link on the sign-in screen.
Optional Supabase container-log analytics is disabled locally; application audit
events remain persisted in Postgres.

The schema grants new accounts the `user` role. Administrators must be
explicitly provisioned by a trusted database operator; signing up cannot grant
admin access. Existing local roles are retained. Application admin routes and
their APIs check verified authentication, MFA and the database role.

## External integrations

Normal `pnpm dev` disables Stripe and AI provider secrets even when `.env.local`
contains them. Google OAuth requires a Google development app and Supabase
provider configuration. Without that configuration the sign-in form reports
the provider error, while local email/password authentication remains available.

For Stripe development, use the existing test-mode key in `.env.local` and run
`pnpm dev:stripe`. It starts the official Stripe CLI in Docker and forwards the
required test webhook events to `/api/stripe/webhook` automatically. The
listener's signing secret goes directly to the app process; it does not replace
your saved environment files. Stop the command to stop its listener. Local
startup rejects live Stripe secret keys.
The public plan page reads the published database catalog; checkout revalidates
the selected plan and its Stripe price on the server. Figma proposal prices do
not create billing entitlements.

## Sandbox boundary for this implementation

Sandbox implementation is deferred. Normal development does not launch a
gateway, Swiftlet, Nest daemon or Egg. The web app persists project metadata,
briefs, conversations, files, versions and infrastructure configuration. It
reports generation, live previews, terminal execution and video rendering as
unavailable when their execution service is not configured.

Sharing creates a revocable, expiring read-only source snapshot. Publishing is
limited to saved static files with a root `index.html`, served with a sandboxed
Content Security Policy. It does not build frameworks or run customer code on
the web server. Saved API tokens never appear in browser responses or audit
metadata.

## Database workflow

```powershell
pnpm migrate       # apply pending local migrations, preserve data
pnpm db:stop       # stop local Supabase
```

`pnpm db:reset` erases the local database and is not part of normal startup.
Do not use `pnpm migrate --dev` for local work: that legacy command targets the
linked remote project. Review all deployment configuration before using it.

See [the action inventory](ui-action-backend-coverage.md) for the endpoint and
persistence boundary of each product action.
