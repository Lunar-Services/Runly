# Runly launch review — 2026-09-28

The supplied `env.prod` was reviewed locally. No secret values are included here. A value being present does not verify that the service works.

## Required configuration

| Setting | Current state | What to add or verify |
| --- | --- | --- |
| `OPENAI_API_KEY` | Empty | A server-only provider key with access to the configured model and sandbox/runtime APIs. |
| `OPENAI_MODEL` | Present | Verify that this model is available to that API project. |
| `RUNLY_PREVIEW_DOMAIN` | Missing | A preview hostname without a URL scheme; configure wildcard DNS and TLS to the runtime gateway. |
| `STRIPE_SECRET_KEY` | Empty | The Stripe server key for the intended environment. |
| `STRIPE_WEBHOOK_SECRET` | Empty | The signing secret for `/api/stripe/webhook`. |
| `RUNLY_BILLING_RECONCILIATION_SECRET` | Empty | A strong server-only secret for the recovery endpoint, or `CRON_SECRET`; schedule the reconciliation job. |
| Supabase URL, publishable key, service-role key | Present | Verify migrations, RLS, storage policies, auth redirects, and email delivery. |
| Runtime secret and gateway list | Present | Verify matching secrets on the app and gateway, reachable WSS, and an active database lease. |
| `RUNLY_SITE_URL` | Present | Match the deployed HTTPS origin; use localhost for local development. |

The current runtime requires AI configuration, valid gateways, active plan entitlements, and an enabled `runtime_policy`. Start the app and gateway as separate supervised services. Configure provider spending limits before enabling jobs.

Stripe configuration also needs active USD monthly Product/Price records mapped to the database plans. Verify checkout, webhook delivery, entitlement updates, cancellation, and billing recovery end to end.

## Missing features versus missing settings

- Workshop, Skills, and Plugins are still explicit “Coming soon” pages.
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` are absent. No current source consumer was found: adding them alone does not implement GitHub integration.
- `RUNLY_CREDENTIAL_ENCRYPTION_KEY` is empty and `SANDBOX_WORKER_URL` / `SANDBOX_WORKER_TOKEN` are absent, but no current source consumers were found. They are older example settings, not verified blockers for the current runtime gateway implementation.
- Verify real signup, confirmation email, password reset, project creation, AI runs, file persistence, previews, and account isolation before calling the full product complete.
- Review legal content, production email sender, monitoring, backups, domain/TLS, and recovery procedures before public launch.

## Interface changes

- All previous cat PNGs and the hanging-cat JPG were removed. Hero, Meet Runly, Cowork, and authentication use only the two supplied Dreamina clips and their extracted posters.
- Pricing's extra cat decoration was removed to keep attention on the plans.
- Audio streams were removed. Forward/reverse loops avoid a hard reset; perfect invisibility of a repeated motion cannot be guaranteed.
- Playback controls have 44px minimum height and remain available if autoplay is blocked. Reduced motion disables automatic playback; explicit playback is still possible. Off-screen and hidden-tab playback pauses.
- Hero media stays inside its column. Small screens retain all prompt suggestions. Added a keyboard skip link and section scroll offsets.
- Dark appearance preserves the black cat instead of inverting its colors.

## Apple design review

Scope: web layout and accessibility principles from [the requested Apple design skill](https://github.com/dickwu/apple-design-skill), not native iOS navigation conventions. The existing editorial type and quiet monochrome palette are retained, with the supplied cats as the recognizable visual detail.

- Fixed: undersized playback and submit controls. `accessibility.md › Mobility`: “Offer sufficiently sized controls.”
- Fixed: a mobile suggestion was hidden. `layout.md › Adaptability` supports consistent functionality across available widths.
- Fixed: unavailable playback control after blocked autoplay. `accessibility.md › Cognitive`: “Let people control audio and video playback.”
- Fixed: inverted cat footage in dark mode. `dark-mode.md › Icons and images` calls for checking images in both appearances.

Live service correctness and a complete accessibility audit remain separate launch checks; neither follows from a responsive page alone.

## Local verification

- Preview: `http://127.0.0.1:3001`; restart with `npm run dev:preview`.
- An ignored `.env.local` was created from the supplied file, changing only the site origin to the local preview. The original file was not changed.
- Browser checks passed at 320, 390, 768, 1024, and 1440 CSS pixels in light and dark themes: no page overflow, no old cat references, and no JavaScript errors.
- Mobile navigation, pause/resume, reduced-motion autoplay suppression, and the mobile login layout passed.
- Changed-component lint, route type generation, and TypeScript checks passed.
- Production build passed. Full-project lint completed with no errors and two existing navigation warnings in `billing.tsx` and `project-workspace.tsx`.
- The browser CLI was unavailable, so the checks used the bundled Playwright runtime with Microsoft Edge.

## Latest visual and administration changes

- Desktop keeps the 125% scale with automatic width. Verified full viewport coverage and no horizontal overflow at 320, 390, 768, 1024, 1440, and 1920 pixels.
- Both loops now use alpha WebM with a tight black-fur matte and preserved white eyes. Browser canvas sampling confirms transparent corners in both clips. The opaque MP4 fallback is no longer used.
- The visible playback buttons were removed at the user's request. Off-screen, hidden-tab, and reduced-motion pauses remain automatic.
- The hero rotates through code, chat, plan, and much more. The Runly wordmark uses a slow monochrome gradient, adjusted separately for each theme. These are local adaptations of the supplied Framer references.
- The closing background is a generated image exported at 3840 x 2160; the native generation was 1672 x 941 and was upscaled for delivery.
- The named account's administrator role was saved and verified. Pending profile, billing, chat, runtime, and monitoring migrations were applied to the Runly Supabase project. The monitoring and control tables are reachable with the server credential.
- AI telemetry currently has no request records. End-to-end AI execution requires a working provider credential, the preview domain, a running gateway, an entitlement, and enabled runtime policy.
- Cost estimates require OPENAI_INPUT_COST_MICROS_PER_MILLION, OPENAI_OUTPUT_COST_MICROS_PER_MILLION, and RUNLY_SANDBOX_COST_MICROS_PER_MINUTE on the gateway. Zero totals before rates are configured must not be interpreted as free AI usage. CPU/RAM samples are not yet populated by the sandbox connector. Revenue/profit displays are estimates, not Stripe revenue reconciliation.
- Stripe credentials are still empty in the local environment. Coupon creation/redemption and payments require configuration and an end-to-end test.

This section supersedes the older playback-control verification notes above.
