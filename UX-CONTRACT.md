# UX Contract

## Product context

- Audience: individual builders and small teams.
- Primary jobs: create a project, request a change, inspect files and preview, checkpoint, connect GitHub, collaborate, and manage billing.
- Target markets: English-language launch; no jurisdiction-specific market behavior is assumed.
- Active locales: `en` only.
- Timezone/calendar policy: store UTC; render user locale when implemented.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Permission model | `Runly_Complete_Secure_Build_Prompt.txt` | Product/security brief | 2026-09-22 |
| Data lifecycle | `Runly_Privacy_Policy_Updated.txt` | Draft privacy policy | 2026-09-22 |
| Billing | Build prompt, billing section | Product brief | 2026-09-22 |
| Legal copy | `content/legal/*-draft.txt` | Draft legal copy | 2026-09-22 |

## Visual contract

- Project `DESIGN.md`: normative visual system.
- Runtime token source: `src/app/globals.css`.
- Supported themes: persistent light and dark themes across public and authenticated surfaces.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | semantic form + shared CSS | this contract | create / edit | browser + validation |
| Scrollbar | global stylesheet | `DESIGN.md` | stable gutter where needed | computed style |
| Toast | not yet implemented | this contract | success / warning / info / error | blocked until mutation flows |
| CRUD | server routes + RLS | product brief | return to list | E2E required |

## Component behavior

Buttons are semantic, 44px minimum height, visibly focusable, and keep size while busy. Inputs retain labels and inline errors. Disabled controls do not fire actions and include adjacent setup rationale when the reason is not obvious.

## Dataset navigation

Admin data tables use server pagination with URL-backed search, filter, sort, page, and page size. Exploratory project lists use explicit load-more. Empty, no-results, loading, and error states retain the list panel footprint.

## Flow ledger

| Operation | Pending | Success | Failure recovery |
|---|---|---|---|
| Create project | disable duplicate submit | project workspace + success status | preserve name/prompt and retry |
| Edit project | checkpoint + queued build | stay in workspace | restore previous checkpoint |
| Delete project | named app dialog | owning list + status | no mutation until confirmed |
| AI request | atomic usage reservation | settle actual usage | release only unbilled reservation |
| GitHub push | checkpoint + expected SHA | saved SHA shown | preserve unsaved state and resolve conflict |

## Navigation and responsive behavior

App sidebar becomes a drawer below 900px. Builder files are hidden behind the mobile tabs in the complete implementation; current foundation stacks chat and preview. Route errors explain whether setup, auth, permission, or provider availability blocked the action.

## Overlays and feedback

App-owned dialogs only. Serious deletion focuses Cancel first. Toasts will use one `aria-live` provider; critical errors remain inline. Dialogs sit above drawers, popovers, and toasts.

## Async and resilience

Mutations are pessimistic unless the operation is locally reversible. AI and payment requests require idempotency keys. Session expiry redirects to login while preserving safe draft input. GitHub writes require expected-SHA conflict checks. Long jobs persist server-side and must be resumable from a job URL.

## Validation

Zod validates route inputs. The database enforces ownership, constraints, and RLS. Secret inputs are never repopulated. Forms prevent duplicate submit and move focus to the first invalid field in the complete flow.

## Permission and clipboard

Unauthorized routes return 401/403 server-side; hiding a control is not authorization. Secret values are never returned or copied from the UI. Disabled setup-dependent actions include a reason.

## Verification

- Required static commands: `npm run lint`, `npm run typecheck`, `npm run build`.
- Browser matrix: desktop 1440px, phone 390px, reduced motion, keyboard navigation.
- Database/RLS, provider, Stripe, GitHub, preview worker, and full CRUD flows require configured external services and integration tests before launch.
