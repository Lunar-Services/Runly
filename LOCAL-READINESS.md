# Local Runly readiness — 2026-09-23

## Connected

- Supabase: Runly Project (`mcsmxsyjqsninbtuvyxf`), LunarGroup, US West.
- Browser-safe publishable key in ignored `.env.local`; no service-role key exposed.
- Initial schema applied with RLS and trigger-managed verified owner identity.
- Email/password auth API, cookie sessions, protected routes, project record create/list, profile save, sign-out.
- Browser checks: sticky header, account illustration/logo, pricing selection and month calculation.
- Build, lint, TypeScript, strict static UI audit pass.
- Auth API invalid credentials returns 400, anonymous projects returns 401.
- Transactional RLS test: own project visible (1); another user's project invisible (0). Test fixtures rolled back.
- Security advisor: informational default-deny tables without client policies; no warning/error findings returned. Those services remain unavailable to clients intentionally.

## Still required before calling this production-ready

1. Complete a real signup and email-verification round trip. No user account or password was created on the user's behalf.
2. Supabase Auth URL configuration: Site URL `http://localhost:3000`; allow `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/callback?next=/reset-password`. Repeat with the approved HTTPS origin before deployment.
3. Configure a production email sender; Supabase's default sender may restrict recipients/rate-limit delivery. Email confirmation remains enabled.
4. AI generation, usage reconciliation and entitlements, persistent file editor/versioning, sandbox previews, GitHub integration, team invitations, Stripe/webhooks, admin operations, and finalized legal documents are not complete. Adding an OpenAI key alone will NOT enable the whole product.
5. Browser access to quota mutation RPCs was revoked because clients must not be allowed to settle/release their own charges. A trusted server-only accounting path is required before enabling AI.
6. GitHub OAuth is visibly disabled until its provider is configured.
7. Public domain is undecided. No domain was purchased and no public site deployed.
8. The user-mentioned new login picture was not attached. Existing grainy sitting cat is used temporarily.
9. Scrolling business cards are explicitly illustrative examples, not invented customer reviews. Genuine approved quotes are needed for testimonials.

## Interface decisions

Keep the existing black-and-white identity. Header becomes translucent on scroll. Login/signup retain separate `/login` and `/signup` routes with a pale illustration panel and visible Runly logo. Numeric animation uses NumberFlow with reduced-motion support. Marquees have a pause control and reduced-motion fallback.
