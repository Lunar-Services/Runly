# Customer pages

This phase covers `/`, `/create`, `/support`, `/pricing`,
`/settings`, `/settings/security`, `/settings/notifications`, and billing pages
under `/settings/billing`. A subsequent workspace update covers
`/dashboard/projects` and `/dashboard/projects/new`; individual project editor
and preview UI keep their existing layout.

The workspace dashboard has no sidebar. Create new provides searchable Empty,
Web application, Video editor, and Image editor choices. The last two are
disabled Coming soon entries. Empty supports JavaScript, TypeScript, HTML/CSS,
and Python preferences and creates only a README. Web application creates actual
starter files: Next.js/React for JavaScript or TypeScript, or a dependency-free
Node static server for HTML/CSS. Template creation does not make an AI call.
Files are saved in `runtime_files` for the existing gateway restore flow.
Apply `202610140006_project_templates.sql` before deploying this update; it adds
validated template and language metadata. This migration is applied locally.

Create now contains the full scrolling landing page. The shared navbar links
to Create, Plans, and Support. Old How it works and Explore URLs redirect to
their sections on Create. Support provides account/billing help and answers;
set optional `RUNLY_SUPPORT_EMAIL` to show a direct contact link.

Apply the October 14 account migrations before deploying the new web image.
The local mock launcher applies them automatically. These add full name,
notification preferences, a deletion request queue, and conditional MFA RLS.

Enable TOTP enrollment and verification in the hosted Supabase Auth settings.
Accounts with a verified factor must complete an authenticator challenge on
sign-in and password recovery. Keep the setup key in a secure place; the UI
requires acknowledgement before activation. There is no invented recovery-code
or operator bypass flow.

Stripe Customer Portal configuration must allow payment method and billing
details updates, subscription cancellation, and supported plan changes. Prices,
payment summaries, invoices, and proration estimates come from the configured
catalog and Stripe. The local mock account has no Stripe customer and shows
empty billing states; opening a page never creates a payment or subscription.

Notification preferences persist per account. An outbound notification worker
does not exist in this repository; delivery must be connected to these saved
preferences before advertising automated project/team/product emails.
Essential authentication and payment messages remain controlled by their
respective providers.

Account export downloads profile details and owned project metadata, excluding
project files and credentials. Deletion is a recorded operator request, with a
customer cancellation action. See [account-deletion.md](account-deletion.md)
for the review queue and resource/billing cleanup process. Requests do not
automatically delete data or cancel subscriptions.

Design reviews used Luna 6 High for usability and Luna 6 Extra High for visual
restraint. The shared navigation and account layout were derived from the
supplied Figma file; imported marks and icons live in `public/brand/figma` and
`public/figma`. Public links navigate to separate pages, and form/switch controls
perform their named actions.
