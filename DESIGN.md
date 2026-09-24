---
version: alpha
name: "Runly"
description: "An editorial monochrome AI-building workspace with a kinetic arrow mark and quiet operational UI."
colors:
  ink: "#101110"
  paper: "#F7F8F6"
  white: "#FFFFFF"
  muted: "#6D716D"
  line: "#DEDFDB"
  soft: "#ECEEEA"
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
    border: "1px solid #DEDFDB"
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

The marketing header matches the page at the top. Once content scrolls beneath it, it becomes an 86%-opaque paper surface in light mode or ink surface in dark mode with restrained blur. Primary section links remain centered while account actions occupy the right edge. Below 900px they form one contained menu. A fine 96px texture has 1.2% opacity in light mode and 1.8% in dark mode.

Theme ownership: `ThemeProvider` in the root layout owns the persisted cookie and document appearance across routes. `src/app/themes.css` owns semantic page, card, raised-surface, text, border, action, focus, and danger tokens and their light/dark adaptations. No page owns a separate theme store. Primary actions reverse their contrast in dark mode; outline and ghost controls use raised surfaces on hover. CSS image inversion is limited to the monochrome logo.

### Forms and overlays

Labels stay visible. Product forms use `noValidate` and inline status regions. Secrets remain masked. Browser alerts, confirms, and prompts are forbidden.

Signed-in identity is visible in the workspace sidebar. Account settings own display-name and profile-picture URL editing; an initials avatar is the fallback.

### Iconography

Lucide line icons at 15–20px. Text labels remain on consequential controls.

### Motion

The static Runly mark accompanies branded wordmarks in headers, footers, account screens, and workspace navigation. Cats remain the only ambient illustration: a 14-second slow standing-cat sway, pointer-following seated cat, and 4.8-second sleeping-cat breathing. No animated R or orbit decoration.

Interaction tokens are canonical in `src/app/interactions.css`: `--motion-fast:150ms`, `--motion-normal:200ms`, `--motion-enter:250ms`, `--motion-ease:cubic-bezier(.2,.8,.2,1)`. Buttons, fields, menus, notices, navigation, and route fades consume these shared tokens. Neutral grey focus replaces the former green ring. Reduced-motion disables motion globally. Existing layout and black-and-white identity stay unchanged.

### Content and data visualization


Voice is plain, specific, and builder-facing. Setup gaps are labeled “Not configured” or “Setup required”; they are never shown as successful integrations.

## Do's and Don'ts

- **Do:** Keep the Runly mark as the single expressive object.
- **Current visual direction:** Use the three user-supplied black cats as transparent, lightly grained illustrations. The logo stays in the wordmark only. Follow Vida's open composition, serif headings, plain navigation, and simple composer. No floating project artifacts, fake activity, decorative trust cards, automatic workflow carousel, oversized moving R, or orbit motifs. Animate cats with restrained breathing and occasional tilt, with reduced-motion support.
- **Don't:** use atom-like rings, orbital paths, spinning particles, or science-themed decoration. Follow the supplied Vida page's clean, open composition; use subtle entrance and interface motion.
- **Do:** Show truthful empty, setup, and unavailable states.
- **Don't:** add generic gradients, glowing blobs, or decorative glass cards.
- **Don't:** imply credentials, billing, database policies, or sandboxing are active before they are verified.
