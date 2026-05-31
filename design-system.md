# Linelo Design System

## Purpose

Linelo should feel calm, finite, and quietly capable. The interface is not trying to turn email into entertainment. It should reduce pressure, clarify the next action, and help users finish their inbox without building more noise.

This design system expands the brand guide into a practical implementation for product UI, Tailwind tokens, and Nuxt UI semantics.

## Design Principles

### 1. Resolution over activity

The UI should make progress feel straightforward, not busy. Every screen should make the next meaningful action obvious.

### Decision order

When two options both work, choose in this order:

1. Preserve the product promise: help the user finish the inbox calmly.
2. Make the next action obvious with the fewest possible controls and distractions.
3. Reuse existing Tailwind tokens, Nuxt UI components, and global theme patterns before adding custom styling.
4. Use the calmest valid visual treatment that still keeps the interface clear and readable.
5. If a choice changes tone, emphasis, or primary-action structure and the answer is not obvious from this document, ask instead of improvising.

### 2. Calm by default

Whitespace, muted surfaces, and restrained contrast should reduce the sense of inbox pressure while still keeping the interface readable.

### 3. Attention protection

Visual emphasis is earned. Use bright color, dense information, and motion only where they reduce ambiguity.

### 4. Quietly opinionated

The product can be slightly offbeat, but it should never become theatrical. Small touches of warmth are good. Cleverness that slows comprehension is not.

### Anti-patterns

Avoid these patterns unless there is a strong, explicit reason not to:

- Dense dashboards that compete for attention when a focused single-path flow would work.
- Extra accent colors, especially saturated blues or purples, competing with the core green and gold palette.
- Pill-shaped buttons, oversized rounded surfaces, or heavy outlines that make the UI feel decorative.
- Reward-style motion, bouncing, pulsing, or other attention-seeking animation.
- Chatty, playful, or inflated AI copy that makes the assistant feel like a product demo.
- Empty states or prompts that sound promotional instead of restful and practical.
- Secondary actions or controls added only to fill space.

## Color System

### Brand palette

| Token           | Role                      | Value                                   |
| --------------- | ------------------------- | --------------------------------------- |
| `primary-800`   | Core brand green          | `oklch(47.94% 0.078 161.08)`, `#2f6b4f` |
| `secondary-500` | Gold accent               | `oklch(74.43% 0.1442 85.54)`, `#d5a422` |
| `off-white`     | Canvas / page background  | `oklch(96.05% 0.0108 95.16)`, `#f4f2ea` |
| `neutral-900`   | Primary text / dark slate | `oklch(23.37% 0.015 157.59)`, `#18201b` |

(https://coolors.co/2f6b4f-d5a422-f4f2ea-18201b)

### Palette roles

| Palette     | Use                                                                       |
| ----------- | ------------------------------------------------------------------------- |
| `primary`   | Primary actions, success-leaning moments, focus states, selected controls |
| `secondary` | Highlighted details, badges, guidance moments, warm accents               |
| `neutral`   | Surfaces, text, borders, dividers, layout structure                       |
| `amber`     | Warnings and deferred attention                                           |
| `red`       | Errors and destructive actions                                            |

### Semantic color rules

| Semantic token | Recommended use                                                       |
| -------------- | --------------------------------------------------------------------- |
| `primary`      | Main CTA, active states, progress, confirmation                       |
| `secondary`    | Supporting emphasis, AI assistance cues, tasteful accents             |
| `neutral`      | Default component color and all base UI structure                     |
| `success`      | Alias to `primary` to keep success states calm instead of bright neon |
| `info`         | Alias to `secondary` for helpful guidance rather than urgent blue     |
| `warning`      | `amber`                                                               |
| `error`        | `red`                                                                 |

### Surface model

| Surface         | Description                                     |
| --------------- | ----------------------------------------------- |
| `bg`            | Warm off-white canvas used for page backgrounds |
| `bg-muted`      | Subtle section background or grouped layouts    |
| `bg-elevated`   | Cards, popovers, and modals                     |
| `border`        | Low-contrast separators                         |
| `border-strong` | Inputs, active containers, selected groups      |
| `text`          | Primary reading color                           |
| `text-toned`    | Long-form body text                             |
| `text-muted`    | Helper text, metadata, timestamps               |

### Color usage guidance

- Prefer neutral surfaces with one intentional accent.
- Use green for completion and decisiveness, not celebration.
- Use gold sparingly. It should feel like guidance or focus, not decoration.
- Avoid low-contrast pale-gold fills for actionable buttons. If gold appears on an action, the label and boundary need to stay crisp.
- Avoid stacking multiple saturated accents in the same component.
- Default component backgrounds should remain light and breathable.

## Typography

### Font families

| Token          | Stack                                                                         | Role                            |
| -------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| `font-sans`    | `Manrope`, `Avenir Next`, `Segoe UI`, `Helvetica Neue`, `Arial`, `sans-serif` | UI text, navigation, forms      |
| `font-display` | Same as `font-sans`                                                           | Headlines and prominent labels  |
| `font-mono`    | `SF Mono`, `Fira Code`, `ui-monospace`, `monospace`                           | Code, shortcuts, machine output |

### Type scale

| Token       | Size        | Line height | Use                   |
| ----------- | ----------- | ----------- | --------------------- |
| `text-2xs`  | `0.6875rem` | `1rem`      | Dense helper metadata |
| `text-xs`   | `0.8125rem` | `1.125rem`  | Captions, timestamps  |
| `text-sm`   | `0.9375rem` | `1.375rem`  | Secondary UI copy     |
| `text-base` | `1rem`      | `1.6rem`    | Default body text     |
| `text-lg`   | `1.125rem`  | `1.7rem`    | Important paragraphs  |
| `text-xl`   | `1.25rem`   | `1.8rem`    | Section leads         |
| `text-2xl`  | `1.5rem`    | `2rem`      | Minor headlines       |
| `text-3xl`  | `1.875rem`  | `2.25rem`   | Page section headers  |
| `text-4xl`  | `2.375rem`  | `1.05`      | Main page headline    |
| `text-5xl`  | `3.25rem`   | `1`         | Hero headline         |

### Weight and rhythm

- Body copy should stay at `400` or `500`.
- Most headings should use `600`.
- Avoid all-caps for core product messaging.
- Tight tracking is appropriate for headlines, not for long body copy.

## Spacing, Radius, and Layout

### Spacing posture

Spacing should feel unhurried. Favor fewer, larger gaps over many tiny ones.

| Pattern                  | Recommendation                            |
| ------------------------ | ----------------------------------------- |
| Tight UI grouping        | `0.5rem` to `0.75rem`                     |
| Standard control spacing | `1rem`                                    |
| Section spacing          | `1.5rem` to `2rem`                        |
| Page padding             | `1.5rem` mobile, `2rem` to `3rem` desktop |

### Radius tokens

| Token        | Value      | Use                              |
| ------------ | ---------- | -------------------------------- |
| `radius-sm`  | `0.375rem` | Small controls                   |
| `radius-md`  | `0.625rem` | Inputs, compact cards, badges    |
| `radius-lg`  | `0.875rem` | Buttons, grouped controls        |
| `radius-xl`  | `1.125rem` | Cards, panes, feature surfaces   |
| `radius-2xl` | `1.5rem`   | Hero containers and modal shells |

### Layout guidance

- Keep one primary action per area.
- Prefer readable column widths over wide dashboard sprawl.
- Use clear vertical hierarchy before adding dividers or extra color.
- Empty states should feel restful, not promotional.

## Elevation and Motion

### Shadow model

| Token                      | Use                                        |
| -------------------------- | ------------------------------------------ |
| `shadow-2xs` / `shadow-xs` | Hairline elevation or sticky UI            |
| `shadow-sm`                | Standard cards and floating panes          |
| `shadow-md`                | Dialogs, open menus, active focus surfaces |
| `shadow-lg`                | Rare high-emphasis overlays                |

Shadows should read as soft structure, not drama.

### Motion rules

| Token             | Value                               | Use                        |
| ----------------- | ----------------------------------- | -------------------------- |
| `ease-snappy`     | `cubic-bezier(0.2, 0.7, 0.2, 1)`    | Control transitions        |
| `ease-gentle`     | `cubic-bezier(0.24, 0.92, 0.32, 1)` | Content entrance           |
| `animate-fade-in` | `280ms`                             | Small reveals              |
| `animate-rise-in` | `420ms`                             | Panel and section entrance |

Motion should support clarity. No bouncing, pulsing, or reward-loop behavior in core workflows.

## Component Guidance

### Buttons

- Primary buttons use `primary` color with solid fill.
- Secondary emphasis can use `secondary` sparingly for guidance or assistance, but not as a washed-out CTA fill.
- Neutral buttons should remain available for non-destructive secondary actions.
- Default to rounded rectangles, not pill buttons. Full-pill controls should be rare and intentional.

### Cards and panels

- Default to elevated warm-white surfaces with soft borders.
- Use moderate radius and soft shadow rather than oversized curves or heavy outlines.
- Reserve tinted surfaces for selected or guided states.

### Inputs

- Inputs should look stable and low-noise.
- Focus indication comes from the green focus ring, not stronger borders alone.
- Placeholder text should stay muted and never compete with user data.

### Badges and status

- `primary` for resolved or positive progress.
- `secondary` for AI-assisted or informational markers.
- `amber` for defer and warning states.
- `red` only for clear errors or destructive paths.
- Keep badges compact and lightly rounded. They should read as labels, not soft bubbles.

## Nuxt UI Mapping

Nuxt UI should use these semantic aliases:

| Nuxt UI semantic color | Linelo palette |
| ---------------------- | -------------- |
| `primary`              | `primary`      |
| `secondary`            | `secondary`    |
| `success`              | `primary`      |
| `info`                 | `secondary`    |
| `warning`              | `amber`        |
| `error`                | `red`          |
| `neutral`              | `neutral`      |

This keeps component states aligned with the brand posture: calm, warm, and clear instead of blue-heavy or over-signaled.

## Tailwind Implementation

The canonical token source lives in `app/assets/css/main.css` using Tailwind CSS v4 `@theme` variables.

- Brand palettes are exposed as `--color-*` variables and utility classes.
- Typography, radius, shadows, breakpoints, and easing live in the same token file.
- Semantic surface variables live in `:root` for runtime use in custom CSS and component shells.

## Writing and UI Copy

- Use short, declarative labels.
- Favor outcomes over system jargon.
- Avoid celebratory or gamified language.
- AI-related UI should sound assistive, not magical.
- When in doubt, choose the plainer sentence.

## Practical Checklist

- Does the screen highlight one next action?
- Is contrast strong enough for reading but still calm overall?
- Are accent colors limited to one main emphasis at a time?
- Does motion guide attention without demanding it?
- Does the copy reduce ambiguity instead of adding enthusiasm?
