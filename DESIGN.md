---
version: alpha
name: "Runly"
description: "An editorial monochrome AI-building workspace with a kinetic arrow mark and quiet operational UI."
colors:
  ink: "#101110"
  paper: "#FAFAFA"
  white: "#FFFFFF"
  muted: "#6D716D"
  line: "#D6D6D6"
  soft: "#F0F0F0"
  signal: "#171717"
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
    border: "1px solid #D6D6D6"
  dialog:
    radius: "1.125rem"
  input:
    minHeight: "2.875rem"
---

# Runly Design System

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

Ink and paper create the primary contrast. White separates functional surfaces. Signal is reserved for healthy/live state, never large decorative fills. Danger is reserved for destructive or publication-blocking states. The global focus ring uses a darker signal-derived green to meet contrast on white.

The light appearance uses a near-white canvas (#FAFAFA) and white cards. Dark appearance uses a deeper black canvas (#050505), dark cards (#0E0E0E), and raised controls (#191919). Borders preserve surface separation and readable contrast. The closing call to action uses a plain theme surface without the hand artwork.

## Typography

Georgia carries only brand-scale headlines and key numeric values. Arial/Helvetica carries controls and product prose. Monospace is reserved for code, identifiers, and technical status. Sentence case is the default.

## Layout

Public sections cap at 1380px and use generous vertical rhythm. Product routes use a fixed desktop sidebar and sticky toolbar; below 900px the sidebar becomes a drawer and app grids collapse. Builder panes become stacked on mobile, with chat first and preview second. Media and async regions reserve their geometry.

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

Signed-in identity is visible in the workspace sidebar. Account settings own display-name and profile-picture URL editing; an initials avatar is the fallback.

### Iconography

Lucide line icons at 15–20px. Text labels remain on consequential controls.

### Motion

The static Runly mark accompanies branded wordmarks in headers, footers, account screens, and workspace navigation. The two user-supplied Dreamina clips remain animated section artwork: silent forward/reverse loops in the hero, Meet Runly, Cowork, and sign-in. Posters come from those clips. Playback pauses off-screen and in hidden tabs; reduced motion disables automatic playback. Cat playback has no visible pause controls. Original black fur is preserved in both themes without image inversion. No animated R or orbit decoration.

Interaction tokens are canonical in `src/app/interactions.css`: `--motion-fast:150ms`, `--motion-normal:200ms`, `--motion-enter:250ms`, `--motion-ease:cubic-bezier(.2,.8,.2,1)`. Buttons, fields, menus, notices, navigation, and route fades consume these shared tokens. Neutral grey focus replaces the former green ring. Reduced-motion disables motion globally. Existing layout and black-and-white identity stay unchanged.

The subscription comparison has one illustrative 12-second idea-to-outline-to-preview sequence. It has a pause control and becomes a static idea card under reduced-motion preference. Its terminal moment is decorative storytelling, never an application's loading state. Light and dark appearances use matching page and header tones; the animated scene may use contained paper or terminal surfaces for contrast.

The decorative code sketch stands on its own within Meet Runly, using a white card in light mode and a dark card in dark mode. The ASCII portrait, ASCII cat, and teacup are not placed beside it or in Cowork. Pricing has no extra cat decoration; its content remains the focus. The final invitation has no reaching hands. Theme-aware monochrome Silk shaders animate behind the hero, invitation, and chat, with reduced-motion and visibility handling. The five supplied cat illustrations form an scroll-driven FlexCarousel between the hero and Meet Runly. The carousel has restrained bending, no color dispersion, optional drag navigation and no timed autoplay, and respects reduced motion. These illustrations describe possible workflows, not active integrations or generated results.

### Content and data visualization

Voice is plain, specific, and builder-facing. Setup gaps are labeled “Not configured” or “Setup required”; they are never shown as successful integrations.

## Do's and Don'ts

- **Do:** Keep the Runly mark as the single expressive object.
- **Current visual direction:** Keep the user-supplied cat and ASCII artwork as restrained, section-specific illustrations rather than a separate gallery. The logo stays in the wordmark only. Follow Vida's open composition, serif headings, plain navigation, and simple composer. No floating project artifacts, fake activity, decorative trust cards, oversized moving R, or orbit motifs. Animate cats and select supporting artwork gently, with reduced-motion support.
- **Don't:** use atom-like rings, orbital paths, spinning particles, or science-themed decoration. Follow the supplied Vida page's clean, open composition; use subtle entrance and interface motion.
- **Do:** Show truthful empty, setup, and unavailable states.
- **Don't:** add generic gradients, glowing blobs, or decorative glass cards.
- **Don't:** imply credentials, billing, database policies, or sandboxing are active before they are verified.

### AI composer

The supplied React Bits PromptBar is integrated into project chat. Its send action uses the authenticated project message endpoint, retains drafts on failure, and preserves idempotent request IDs. Active AI tasks can be cancelled through agent.cancel. Text and code attachments become explicit message context, validated against API length and byte limits. Model and effort selectors remain hidden until backend support exists; no fictional model choices or connected sources are shown. Menus use opaque theme surfaces. The Usage & plan link opens the dashboard.

Dark-mode base surfaces share pure black (#000), including the page, cards, header, sidebars, and admin panels. Borders and text define hierarchy. Silk spans the full viewport width. The picture section has normal document height with no sticky positioning or forced scroll distance. Page scrolling moves the images, and visitors can optionally drag them. Vertical wheel gestures always continue down the page. Dark pricing and marketing sections override legacy tinted colors with pure black and neutral grey text.

The pricing calculator uses a 32px rounded card, a compact 18px segmented plan selector, a bordered term control, and a balanced price/checkout layout. Header Get started is 44px tall with 14px type. Navigation links have restrained hover lift, neutral background, and an animated underline. Reduced motion removes these transitions. Carousels with captureWheel disabled never register a wheel handler and use normal overscroll chaining; page-navigation keys also pass through.

### Workflow illustrations and motion (September 29, 2026)

The marketing workflow uses the four supplied Runly illustrations as a numbered story, with restrained TiltedCard motion on mouse devices. A prompt example fills the existing hero composer. Neutral gradients are confined to illustration frames and link hover sweeps; dark page surfaces remain black. Business examples use a continuous, non-interactive ribbon with duplicated content hidden from assistive technology and a static grid for reduced motion. ParticleText provides one monochrome signature at the end of that section, pauses outside the viewport, and falls back to readable HTML text for reduced motion.
