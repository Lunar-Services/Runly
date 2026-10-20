# Figma UI flow coverage

This records the earlier UI implementation pass. The subsequent backend work
connects the protected project and admin screens to Supabase; consult the
[current action inventory](ui-action-backend-coverage.md) for their live behavior.
Fixture screens are now available only through explicit development previews.

Reference: Runly `far2TDMbDBmpefCTL7Fp1f`, page `0:1`.

The workspace uses local fixtures. Its actions do not create projects, provision
sandboxes, call AI providers, publish sites, or purchase plans. Existing real
project, account, MFA, and admin routes retain their server guards.

| Figma frame                          | Entry                                       | Treatment                                                                                                   |
| ------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 53:135 Landing desktop               | `/`                                         | Preserve existing SSR page and visual/motion work; pass the entered idea to the local workspace flow.       |
| 53:626 Landing mobile                | `/`                                         | Preserve existing responsive landing.                                                                       |
| 53:232 New project                   | `/workspace/new`, `/dashboard/projects/new` | New CSR workspace shell, composer, attachments, model and project starters.                                 |
| 53:283 Website                       | `/workspace/website`                        | Local conversation, website preview, preview/code/device controls, share/publish presentation.              |
| 53:476 App                           | `/workspace/app`                            | App canvas and interactive daily habits.                                                                    |
| 53:372 Video                         | `/workspace/video`                          | Cloud clip, playback position and video/audio timeline.                                                     |
| 53:674 Mobile workspace              | Workspace at mobile width                   | Chat/Preview navigation, project card and pinned composer.                                                  |
| 53:738 Mobile preview                | Workspace Preview tab at mobile width       | Separate preview surface and publish control.                                                               |
| 53:1192 Editor v2                    | `/workspace/editor`                         | Separate CSR editor shell with file/history/code states.                                                    |
| 53:589, 53:705 Login desktop/mobile  | `/login`                                    | New presentation with local continuation; existing password authentication remains at `?method=password`.   |
| 53:606, 53:720 Signup desktop/mobile | `/signup`                                   | New presentation with local continuation; existing password account creation remains at `?method=password`. |
| 53:757 Pricing                       | `/pricing`                                  | Use the later refined pricing frame below.                                                                  |
| 53:1579 Refined pricing/account      | `/pricing`, `/settings`                     | Match pricing child 53:1580; preserve existing account implementation.                                      |
| 53:862 Payment                       | `/settings/billing/checkout`                | Preserve existing checkout work.                                                                            |
| 53:1554 Payment success              | `/settings/billing/success`                 | Preserve existing confirmation work.                                                                        |
| 53:942 Admin dashboard               | `/admin` and admin tabs                     | Preserve existing role-gated dashboard, Swiftlet and Nests.                                                 |
| 53:1324 Account profile              | `/settings`                                 | Preserve existing profile/theme/export UI and working provider controls.                                    |
| 53:1481 Account security             | `/settings/security`                        | Preserve MFA, sessions and deletion-request flow.                                                           |
| 53:1131 Notifications                | `/settings/notifications`                   | Preserve existing four preference categories.                                                               |
| 53:1395 Billing                      | `/settings/billing`                         | Preserve existing plan/payment/details/invoice UI.                                                          |

## Rendering boundaries

- Customer pages retain server rendering with interactive client islands.
- Workspace fixtures load through a client `next/dynamic` boundary with
  `ssr: false`. The existing real UUID project editor uses the same CSR setting.
- `/workspace/*` exposes sample data only. Real `/project/:uuid`, settings and
  admin routes retain the existing authentication, MFA and role checks.
- Guarded project URLs open the new UI layer by default. The original connected
  editor is preserved at `/project/:uuid?runtime=live` for integration work.

## Intentional existing service differences

The existing account/auth services support GitHub/password flows rather than the
Google/email-link design. The new auth presentation makes no claim that a Google
session or email was created. Password, reset, verification and MFA paths remain
available. Account deletion retains the existing deletion-request semantics.
No authentication, billing, role, or project service was implemented for this UI
pass. The plan cards use review prices from Figma and do not initiate purchases.
