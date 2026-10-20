---
version: alpha
name: "Runly"
description: "An editorial monochrome AI-building workspace with a kinetic arrow mark and quiet operational UI."
colors:
  ink: "#101110"
  paper: "#E6E9EB"
  white: "#F2F4F5"
  muted: "#6D716D"
  line: "#ADB4B8"
  soft: "#D1D5D7"
  signal: "#CDF54A"
  danger: "#B33A2F"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    lineHeight: "0.98"
  sans:
    fontFamily: "Arial, Helvetica, sans-serif"
    lineHeight: "1.5"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    lineHeight: "1.6"
rounded:
  DEFAULT: "0.625rem"
  sm: "0.375rem"
  md: "0.75rem"
  lg: "1.125rem"
  pill: "999px"
spacing:
  section-gap: "7.5rem"
  page-max: "86.25rem"
components:
  button:
    minHeight: "2.75rem"
  card:
    border: "1px solid #ADB4B8"
  dialog:
    radius: "1.125rem"
  input:
    minHeight: "2.875rem"
---

# Runly Design System

## Payment confirmation

The matching checkout review screen, `/settings/billing/checkout?plan=...`,
follows node `53:862`. Its two columns, form controls, price summary, and notices
use HTML/CSS. Only the logo and small Figma icons are image assets. Available
plan selections lead here before opening the existing Stripe Checkout or plan
change portal. Production loads published plan prices and allowances, and card
details are collected by Stripe. In development, `?preview=true` shows the
sample Creator card form and can continue to the sample confirmation. Preview
inputs have no form field names, are never serialized or stored, and are marked
for sample data only. The columns stack on phones.

`/settings/billing/success` follows Figma node `53:1554`: a standalone dark
confirmation card, Manrope type, a green check icon, a payment summary, and blue
workspace/billing actions. Layout, shapes, and controls use HTML/CSS; only the
existing logo and Figma check icon are image assets. The card compacts on short
desktop viewports and stacks naturally on phones. Its development-only
`?preview=true` state uses the sample Creator payment; production confirms the
signed-in customer's Checkout Session through a read-only endpoint before
showing success. Processing, expired, missing, and unavailable states never
show fabricated payment details. Checkout return URLs carry Stripe's session
placeholder; subscription access remains managed by the existing billing flow.

## Admin dashboard

The admin dashboard follows Figma node `53:942`: a dark operational surface,
224px sidebar, Manrope type, compact tables, blue actions, and green/amber status
labels. Its scoped `.admin-surface` tokens in `src/app/globals.css` apply in either
account theme. The responsive layout uses HTML elements and scoped CSS in
`admin-dashboard.module.css`. Panels, fields, pills, dividers, avatar circles,
and chart bars use CSS; the chart is driven by numeric records.
`public/figma/admin/` contains only icons and the Runly logo. The seven dashboard tabs
use explicitly illustrative data; the existing protected billing catalog,
provider configuration, and legal tools remain separate live/setup tools.
Admin routes require a verified server session, completed MFA when configured,
and an `account_roles` administrator record. The profile menu uses the same
database role and fails closed when a role cannot be established.

Swiftlet and Nests extend the same compact admin shell. Swiftlet configures the
Perch-to-orchestrator endpoint, Egg placement, and lifecycle defaults; Nests
manages daemon endpoints and capacity. These two tabs use production-facing
labels, with mock infrastructure enabled only when `NODE_ENV=development`.
Development starts with five Nests across four countries, including Online,
Draining, and Offline states. The fleet table shows active Eggs against capacity
and compact CPU/RAM utilization meters; unavailable telemetry shows a dash.
Country flags reveal their names on hover or keyboard focus, and the Nest form
uses a searchable country selector with locally bundled SVG flags. Existing
development records retain their settings when upgraded. Mock edits persist in a separate development-only
browser store. Production does not load mock records or browser configurations,
and service mutations remain unavailable until backend integration is added.
Credentials cannot be entered and no infrastructure requests are sent. Forms
use flat sections and existing admin tokens; Nest dialogs keep their action row
visible while fields scroll.

## Overview

### Creative North Star

The supplied Viskey & Vida screenshot and saved site are compositional references: a pale open canvas, oversized editorial serif copy, restrained black controls, a characterful monochrome figure, and generous story-led sections. Runly translates those ideas into its own arrow mark, floating project artifacts, a continuous workflow stage, and a company-grade trust narrative.

### Product context and register

- **Audience and primary job:** Solo builders and small product teams turning plain-language ideas into inspectable software projects.
- **Target markets:** English-language web product, with locale expansion intentionally uncommitted.
- **Usage scene:** Marketing discovery on phone or desktop; sustained project work on laptop/desktop; chat, review, and project status remain usable on phones.
- **Register:** Hybrid. Public routes carry the editorial expression; authenticated and admin routes are compact, stable, and operational.
- **Memorable signature:** The Runly arrow moving through a field of conversation, code, and preview artifacts.
- **Restraint:** Product, billing, admin, legal, and error states use flat surfaces and plain language.
- **Anti-references:** Neon gradient AI landing pages, glassmorphism, fake dashboards, unearned statistics, and decorative motion.
- **Token ownership/runtime mapping:** This file is normative. `src/app/globals.css` is the runtime implementation. Changes must update both.

## Colors

### Customer offer copy

Keep the established layouts while describing the ready-to-use project workspace
and upcoming uncensored open-model access. Mark future capabilities accurately;
GitHub requires setup. The public Plans page uses AI Workspace Hours with AI,
code execution, and live previews included. One workspace and development sandbox
per user. Preserve the Figma card styling, feature Plus in blue, and keep PAYG
in a separate section below the three subscription cards. No credit or token
pricing in marketing copy. Account billing and checkout retain their actual
backend configuration until the separate billing migration.
See `deploy/customer-offer.md` for proposals and cost guardrails.

Standard is $9/month with 3 hours/week and 2 GB storage, Plus $19 with 10 hours
and 5 GB, Pro $49 with 30 hours and 20 GB. PAYG is $10 for 5 hours, valid 30 days.
Keep cards concise. Explain runtime readiness, sleeping, provisioning waits,
fair-use limits, four grants per billing cycle, and expiry in collapsed FAQs.
These are marketing terms; billing enforcement is not implemented in this phase.

### Customer pages (October 2026)

The landing and full scrolling Create page follow the supplied Runly
cloud composition: a sky image, black display text, an italic Georgia second
line, and a white composer. The shared customer navbar uses the imported Figma
R mark (black on light surfaces), Create/Plans/Support destinations, and an
Workspace/Account/Logout menu. Support uses calm open sections and readable help articles.
Navigation and promotional actions open routes; only the accessibility skip
link jumps within a page. The central navigation capsule follows the supplied
Figma reference; supporting content avoids additional pill or glass treatments.

Home and Create use a fixed sky backdrop with two slowly drifting cloud layers.
The client's local clock selects dawn (05–07), day (07–17), sunset (17–20),
or night (20–05), refreshing every minute and when the tab becomes visible.
Night uses navy clouds, quiet stars, and light hero text; content sections scroll
over the sky on opaque surfaces. The white composer and compact navbar retain
their contrast. This is clock-based ambiance without location access. Reduced
motion disables cloud drift.

The showcase below the full-height hero reveals when it enters view:
a rise from 56px below its resting point to 72px above the section boundary,
overlapping the fixed sky, a slight scale correction, and a one-second fade.
Reduced motion
shows the frame immediately; keyboard focus also reveals it.
Hero copy, composer, and suggestions stay opaque until scrolling past 18% of
the hero height (capped at 160px), then fade completely over 450ms before the
showcase enters. Fully faded controls become inert;
The showcase is hidden in the initial markup and its reveal is enabled only
after the hero's 450ms fade completes. Returning to the top hides it again.
a focused composer stays visible. Reduced motion keeps the hero static.

The remaining editorial sections use once-only entrances: feature rows settle
in a short stagger, the sky illustration unveils upward, workflow steps follow
in sequence, and the final invitation settles gently. Motion is limited to
20–24px travel and 550–750ms durations, with reduced-motion and keyboard-focus
fallbacks. Section spacing is more generous across desktop and phone layouts;
critique refinements trim the gap between related sections and shorten stagger
delays so readers can continue without waiting.

Text selection uses a pale blue highlight with dark ink on light surfaces.
Dark account/workspace surfaces retain the signal highlight. Landing selection
always follows the light palette, including when its clock-based sky is night.
Night clouds remain visible against navy. Two cloud tracks travel continuously
left over 160/220-second cycles. Each track repeats a mirrored image pair so
edge pixels match and the wrap returns to an identical frame without reversing.

Profile, Security, Notifications, and Billing & plan use that same top navbar
plus a dedicated account sidebar. `src/components/account.css` owns scoped
customer tokens: light canvas `#FAFBFD`, card `#F0F3F7`, ink `#151B26`, and
selected surface `#E4EDF8`; dark canvas `#101316`, card `#1E242C`, and muted
text `#AEB8C8`. Controls are at least 44px high. Sections use quiet dividers,
with flat surfaces for grouped actions, and notification preferences stay in
open rows. The account navbar stays at the top and the desktop sidebar is fixed
below it, with Appearance and Sign out anchored at the bottom. Mobile account
destinations form a two-column grid; Appearance and Sign out remain in a fixed
bottom bar. The workspace project dashboard uses the shared customer header,
an open project grid, and no sidebar. Dashboard and project creation headers
show only the brand and account actions, without the center marketing links.
Create new includes a plain idea composer
above its searchable template catalog. Decide for me recommends an available
template and language with an explanation; the selection remains editable.
The shared footer spans the viewport, with its contents centered to the page
width. The template catalog sits beside project name and language controls. Unavailable editors are
clearly marked Coming soon. The landing showcase uses native text and vector
shapes so it stays sharp at any display density. Individual project editor
styles are maintained separately.

Ink and paper create the primary contrast. White separates functional surfaces. Signal is reserved for healthy/live state, never large decorative fills. Danger is reserved for destructive or publication-blocking states. The global focus ring uses a darker signal-derived green to meet contrast on white.

The light appearance uses a soft cool-gray canvas and lighter neutral card surfaces, without a warm or yellow cast. Text, button, and action colors remain unchanged when the canvas is recalibrated. Dark appearance retains its near-black palette.

## Typography

Georgia carries only brand-scale headlines and key numeric values. Arial/Helvetica carries controls and product prose. Monospace is reserved for code, identifiers, and technical status. Sentence case is the default.

## Layout

Public sections cap at 1380px and use generous vertical rhythm. The workspace dashboard has no sidebar; project and template grids collapse on smaller screens. Individual project editor routes retain their existing toolbar and navigation. Builder panes become stacked on mobile, with chat first and preview second. Media and async regions reserve their geometry.

## Elevation & Depth

Borders and tonal layers do most hierarchy work. Shadows are limited to the prompt composer, floating status notes, and the dark workspace showcase. Product cards remain flat.

## Shapes

Pills identify actions and compact status. Cards use 16–18px corners, while dense editor surfaces use 6–10px corners. The mark container uses a compact rounded square.

## Components

### Foundational visual states

Interactive targets define hover, visible keyboard focus, disabled opacity and cursor, and stable busy geometry. Signal dots always include a text label. The default loading state is inline status copy without layout shift.

### Buttons and actions

Solid ink is primary, outline is secondary, and white-on-ink is the dark-surface primary. Buttons keep a 44px minimum height. Destructive actions use explicit verbs and the danger tone only at final confirmation.

### Navigation and data display

Marketing navigation collapses into a contained menu. Product navigation transforms into an off-canvas drawer. Empty states explain the next action and never invent project or usage data.

The marketing header spans the page at the top. Once content scrolls beneath it, it becomes a compact rounded pill with a strongly frosted, cool-gray or charcoal translucent surface and 48px background blur. Its text remains solid and legible; reduced-transparency preference receives an opaque card surface. Primary section links remain centered while account actions occupy the right edge. Below 900px they form one contained menu. A fine 96px texture has 1.2% opacity in light mode and 1.8% in dark mode.

Theme ownership: `ThemeProvider` in the root layout owns the persisted cookie and document appearance across routes. `src/app/themes.css` owns semantic page, card, raised-surface, text, border, action, focus, and danger tokens and their light/dark adaptations. No page owns a separate theme store. Primary actions reverse their contrast in dark mode; outline and ghost controls use raised surfaces on hover. CSS image inversion is limited to the monochrome logo.

### Forms and overlays

Labels stay visible. Product forms use `noValidate` and inline status regions. Secrets remain masked. Browser alerts, confirms, and prompts are forbidden.

Signed-in identity is available from the shared header account menu. Account settings own display-name and profile-picture URL editing; an initials avatar is the fallback.

### Iconography

Lucide line icons at 15–20px. Text labels remain on consequential controls.

### Motion

The static Runly mark accompanies branded wordmarks in headers, footers, account screens, and workspace navigation. The cats and ASCII artwork are ambient illustrations: a slow standing-cat sway, pointer-following seated cat, gently breathing working cat at the Cowork laptop, and restrained motion on the section artwork. No animated R or orbit decoration.

Interaction tokens are canonical in `src/app/interactions.css`: `--motion-fast:150ms`, `--motion-normal:200ms`, `--motion-enter:250ms`, `--motion-ease:cubic-bezier(.2,.8,.2,1)`. Buttons, fields, menus, notices, navigation, and route fades consume these shared tokens. Neutral grey focus replaces the former green ring. Reduced-motion disables motion globally. Existing layout and black-and-white identity stay unchanged.

The subscription comparison has one illustrative 12-second idea-to-outline-to-preview sequence. It has a pause control and becomes a static idea card under reduced-motion preference. Its terminal moment is decorative storytelling, never an application's loading state. Light and dark appearances use matching page and header tones; the animated scene may use contained paper or terminal surfaces for contrast.

The decorative code sketch stands on its own within Meet Runly, using a white card in light mode and a dark card in dark mode. The ASCII portrait, ASCII cat, and teacup are not placed beside it or in Cowork. The hanging cat sits beside Pricing. At the final invitation, the user-supplied reaching-hands artwork is split into two independently masked hand layers; only the hands move toward one another, never the entire picture. Reduced-motion preference makes them still. These details are illustrative site accents, never application loading states or claims of generated output.

### Content and data visualization

Voice is plain, specific, and builder-facing. Setup gaps are labeled “Not configured” or “Setup required”; they are never shown as successful integrations.

## Do's and Don'ts

- **Do:** Keep the Runly mark as the single expressive object.
- **Current visual direction:** Keep the user-supplied cat and ASCII artwork as restrained, section-specific illustrations rather than a separate gallery. The logo stays in the wordmark only. Follow Vida's open composition, serif headings, plain navigation, and simple composer. No floating project artifacts, fake activity, decorative trust cards, oversized moving R, or orbit motifs. Animate cats and select supporting artwork gently, with reduced-motion support.
- **Don't:** use atom-like rings, orbital paths, spinning particles, or science-themed decoration. Follow the supplied Vida page's clean, open composition; use subtle entrance and interface motion.
- **Do:** Show truthful empty, setup, and unavailable states.
- **Don't:** add generic gradients, glowing blobs, or decorative glass cards.
- **Don't:** imply credentials, billing, database policies, or sandboxing are active before they are verified.
