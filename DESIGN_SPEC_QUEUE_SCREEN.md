# Linelo Main Queue Screen — Design Specification

## Document Overview

This document defines the comprehensive visual and interaction design for Linelo's main queue screen—the central interface where users process their email one message at a time. This specification synthesizes insights from the PRD and Brand Guidelines to create a calm, focused, and resolution-oriented experience.

---

## Design Philosophy

### Guiding Principles

1. **One decision, one moment** — The entire screen exists to support a single action on a single message. Every element earns its place by contributing to this decision.

2. **Resolution, not management** — The interface should feel like forward motion, not maintenance. Users should sense progress without numerical pressure.

3. **Calm as a feature** — Visual quiet reduces cognitive load. The design uses restraint as an active choice, not emptiness.

4. **Decisive, not urgent** — Actions should feel confident and final without manufactured pressure. No countdown timers, no red warnings, no guilt mechanics.

5. **AI as whisper, not voice** — AI suggestions appear as supportive options, not commanding directives. The user remains the decision-maker.

---

## Visual Foundation

### Color System

The palette derives from the brand guidelines, emphasizing warmth and calm over clinical sterility.

#### Primary Colors

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Background** | Warm Off-White | `#F5F5F3` | Primary canvas, creates soft, paper-like warmth |
| **Surface** | Pure White | `#FFFFFF` | Message card, elevated containers |
| **Text Primary** | Dark Slate | `#1C1F24` | Headlines, body text, sender names |
| **Text Secondary** | Slate Gray | `#64696F` | Timestamps, metadata, explanatory text |

#### Accent Colors

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Action Primary** | Muted Green | `#6E8F7A` | Primary action buttons, success states, progress indicators |
| **Action Hover** | Deep Green | `#5A7A66` | Hover states for primary actions |
| **Subtle Border** | Light Gray | `#E5E5E3` | Card borders, dividers, subtle containment |

#### Semantic Colors (Used Sparingly)

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Focus Ring** | Muted Green | `#6E8F7A` at 40% opacity | Keyboard focus indicators |
| **Error** | Muted Coral | `#C27A6E` | Connection issues, send failures (rare) |

### Typography

Typography follows the brand's preference for clean, neutral sans-serif fonts that recede in favor of content.

#### Font Family

- **Primary:** Inter (or system sans-serif fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **Monospace (optional):** For email addresses or technical elements: `'SF Mono', 'Fira Code', monospace`

#### Type Scale

| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| **Sender Name** | 18px | 600 (Semibold) | 1.3 | -0.01em |
| **Subject Line** | 16px | 500 (Medium) | 1.4 | 0 |
| **Message Body** | 15px | 400 (Regular) | 1.6 | 0.01em |
| **Metadata** | 13px | 400 (Regular) | 1.4 | 0.02em |
| **Action Labels** | 14px | 500 (Medium) | 1.2 | 0.01em |
| **Explanation Text** | 13px | 400 (Regular) | 1.5 | 0.01em |

#### Typography Rules

- Body text uses `text-pretty` or `text-balance` for optimal line breaks
- Maximum line width for message body: 65–70 characters (~600px)
- Generous paragraph spacing (1.5em between paragraphs)
- No justified text—always left-aligned for readability

### Spacing System

Based on an 8px grid to create consistent rhythm:

| Token | Value | Usage |
|-------|-------|-------|
| `space-xs` | 4px | Icon-to-text gaps, tight groupings |
| `space-sm` | 8px | Related element spacing |
| `space-md` | 16px | Section padding, card internal spacing |
| `space-lg` | 24px | Major section separation |
| `space-xl` | 32px | Screen-edge padding, breathing room |
| `space-2xl` | 48px | Vertical rhythm between major zones |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Buttons, badges |
| `radius-md` | 12px | Cards, containers |
| `radius-lg` | 16px | Modal overlays, sheets |

### Shadows

Shadows are minimal and soft—never harsh or dramatic:

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-card` | `0 1px 3px rgba(28, 31, 36, 0.04), 0 4px 12px rgba(28, 31, 36, 0.03)` | Message card elevation |
| `shadow-hover` | `0 2px 8px rgba(28, 31, 36, 0.06), 0 8px 24px rgba(28, 31, 36, 0.04)` | Hover lift on card |
| `shadow-button` | `0 1px 2px rgba(28, 31, 36, 0.05)` | Subtle button depth |

---

## Screen Anatomy

The queue screen is divided into three primary zones, organized vertically with generous spacing:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  HEADER ZONE                         │   │
│  │           (minimal, unobtrusive)                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │                                                     │   │
│  │                  MESSAGE ZONE                       │   │
│  │              (primary focus area)                   │   │
│  │                                                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  ACTION ZONE                         │   │
│  │           (decisions and suggestions)                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Zone 1: Header

### Purpose

Provide orientation and access to secondary functions without competing for attention.

### Layout

- Fixed to top of viewport
- Height: 56px
- Horizontal padding: `space-xl` (32px)
- Background: Matches page background (`#F5F5F3`) with no border—blends seamlessly

### Elements

#### Left: Brand Mark

- Linelo wordmark or small logo
- Muted, low-contrast treatment (e.g., 60% opacity or secondary text color)
- Click/tap returns to queue (if navigated away) or acts as a subtle home anchor
- Size: ~20px height

#### Center: Progress Indicator (Subtle)

- **Not a count** — The PRD explicitly states not to show remaining message count
- Instead, display qualitative progress signals:
  - "High-priority messages" (when processing urgent tier)
  - "Working through your inbox" (neutral, mid-session)
  - "Low-priority tail" (when bulk/newsletters dominate)
  - Empty state when at inbox zero
- Typography: 13px, secondary text color, lowercase or sentence case
- Optional: A soft, thin progress arc (not a bar) that fills without showing specific numbers

#### Right: Utility Controls

- **Settings icon** — Opens preferences sheet (drawer from right)
- **Account avatar** — Circular, 28px, shows connected account; dropdown for account switching or disconnection
- Icons use secondary text color, brighten slightly on hover

### Visual Treatment

- No visible background or border
- Elements feel "floating" on the page background
- Minimal footprint—should be ignorable during active triage

---

## Zone 2: Message Display

### Purpose

Present the current message with complete clarity. This is where the user's eyes spend 80% of their time.

### Container

- **Card Design:** Elevated white surface on the warm off-white background
- **Width:** Maximum 680px, centered horizontally
- **Vertical Position:** Centered in the remaining viewport (between header and action zone), with slight upward bias to account for action zone height
- **Padding:** `space-lg` (24px) internal padding, more on larger screens
- **Border:** 1px solid `#E5E5E3` (subtle containment)
- **Border Radius:** `radius-md` (12px)
- **Shadow:** `shadow-card`

### Message Header

Displayed at the top of the card, providing essential context at a glance.

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [Avatar]  Sarah Chen                              2:34 PM  │
│            sarah@company.com                       Today    │
│                                                             │
│  Subject: Q3 Planning — Need Your Input                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Sender Information

- **Avatar:** 40px circular, showing sender photo if available, or initials on a soft colored background derived from their email address (deterministic color generation for consistency)
- **Sender Name:** Primary text, semibold, 18px
- **Email Address:** Below name, secondary text color, 13px
- Layout: Avatar left, name/email stacked to the right

#### Timestamp

- Right-aligned with sender info
- Two-line format for clarity:
  - Time: "2:34 PM" (12-hour format)
  - Date: "Today" / "Yesterday" / "Apr 15" (relative when recent)
- Secondary text color, 13px
- No "ago" phrasing—absolute times feel calmer

#### Subject Line

- Full width below sender block
- Medium weight, 16px
- Truncate with ellipsis only if exceptionally long (rare)
- Separated from sender block by `space-md` (16px)

### Message Body

The content of the email, displayed with maximum readability.

#### Content Treatment

- **Prose styling:** 15px body text, 1.6 line height, optimal reading width
- **Paragraph spacing:** 1.5em between paragraphs
- **Quoted text:** Slightly indented, with a subtle left border (2px, `#E5E5E3`), and slightly muted text color
- **Links:** Underlined, muted green color, no aggressive styling
- **Attachments:** Displayed as small, unobtrusive chips below the body (icon + filename + file size)

#### Thread Context

When the message is part of a thread:

- Show the most recent message fully
- Earlier messages in thread are collapsed by default
- Expandable via a subtle "Show 3 earlier messages" link (secondary text, no button styling)
- When expanded, earlier messages appear above in chronological order, with visual separation (horizontal rule or spacing)
- Collapsed quoted text ("On Apr 14, John wrote...") is hidden by default but expandable

#### Scrolling Behavior

- If message body exceeds viewport space, the message content scrolls independently within the card
- Card itself remains fixed in position
- Subtle scroll indicators (fade gradient at top/bottom when scrollable)
- Scrollbar: Thin, muted, only visible when hovering or scrolling

### Explanation Line (Optional)

The PRD specifies that prioritization explanations are configurable (default off). When enabled:

- Position: Immediately above the message card, outside its boundary
- Typography: 13px, secondary text color, italic or lighter weight
- Content examples:
  - "From a frequent contact, time-sensitive language"
  - "Recent thread, awaiting your response"
  - "Newsletter, low interaction history"
- Should feel like a whisper, not a headline

---

## Zone 3: Action Area

### Purpose

Present the four terminal actions and AI-suggested approaches clearly, enabling quick, confident decisions.

### Layout

- Fixed to bottom of viewport (sticky)
- Background: Slight gradient from transparent to page background, or a subtle frosted glass effect to separate from content
- Height: Auto-sizing based on content, typically 140–180px
- Padding: `space-lg` top, `space-xl` bottom (to clear mobile safe areas)
- Max-width aligned with message card (680px), centered

### Structure

The action area has two tiers:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            AI SUGGESTIONS (2-3 options)              │   │
│  │  ┌───────────────┐  ┌───────────────┐               │   │
│  │  │ Reply — accept│  │ Mark handled  │               │   │
│  │  │ the request   │  │ no action     │               │   │
│  │  └───────────────┘  └───────────────┘               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CORE ACTIONS (always visible)           │   │
│  │                                                      │   │
│  │  [Reply]   [Handled]   [Delegate]   [Add Task]      │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tier 1: AI Suggestions

- **Position:** Above the core action buttons
- **Display:** 2–3 horizontal cards/chips (per PRD guidance)
- **Purpose:** Pre-configured actions that combine intent + action (e.g., "Reply — accept the meeting")

#### Suggestion Chip Design

- **Container:** Rounded rectangle, subtle border, white background, soft shadow
- **Size:** Auto-width based on content, height ~44px
- **Layout:** Icon (optional) + text label
- **Typography:** 14px, medium weight
- **Hover:** Slight lift (`shadow-hover`), border color shifts to muted green
- **Click:** Immediate action (opens reply composer with pre-filled draft, marks as handled, etc.)

#### Suggestion Content Examples

- "Reply — accept the request"
- "Reply — decline politely"
- "Mark as handled — no action needed"
- "Add to tasks — deadline mentioned"
- "Delegate — forward to [Name]"

#### When Suggestions Aren't Shown

For some messages, the AI may not have confident suggestions. In this case:
- The suggestion tier is simply absent (not shown as empty)
- The core action buttons shift upward to fill the space
- No error state or "no suggestions" message—silence is intentional

### Tier 2: Core Actions

Four terminal actions are always visible, representing the complete decision space.

#### Button Layout

- Horizontal row, evenly spaced
- Center-aligned within the action zone
- Gap: `space-md` (16px) between buttons

#### Button Design

Each button combines an icon with a short label:

| Action | Icon | Label | Keyboard Shortcut |
|--------|------|-------|-------------------|
| Reply | Arrow-reply icon | "Reply" | `R` |
| Handled | Check-circle icon | "Handled" | `H` |
| Delegate | Forward-arrow icon | "Delegate" | `D` |
| Add Task | Plus-square icon | "Add Task" | `T` |

#### Button Styling

- **Default State:**
  - Background: Transparent or very light gray
  - Border: 1px solid `#E5E5E3`
  - Text/Icon: Secondary text color
  - Border-radius: `radius-sm` (6px)
  - Padding: 12px 20px
  - Shadow: `shadow-button`

- **Hover State:**
  - Background: White
  - Border: 1px solid muted green (`#6E8F7A`)
  - Text/Icon: Dark slate
  - Shadow: `shadow-hover`
  - Subtle scale transform (1.02x)

- **Focus State (Keyboard):**
  - Focus ring: 2px muted green at 40% opacity, 2px offset
  - Same visual treatment as hover

- **Active/Pressed:**
  - Background: Muted green at 10% opacity
  - Scale: 0.98x (slight press effect)

- **Primary Emphasis (Optional):**
  - If one action is strongly suggested by AI (high confidence), that core button could have a subtle accent indicator (small dot or slightly stronger border) to guide attention without being pushy

#### Keyboard Shortcuts

- Display shortcut letters as subtle badges within or below each button (e.g., small "R" indicator)
- Typography: 11px, secondary text color, monospace
- Position: Below the button label or in the bottom-right corner of the button

---

## State Variations

### Empty State: Inbox Zero

When all messages are processed:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                        ✓                                    │
│                                                             │
│                   All caught up.                            │
│                                                             │
│             You've finished your inbox.                     │
│                                                             │
│                                                             │
│                     [Close Linelo]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Design Treatment

- Centered vertically in the viewport
- **Icon:** Simple checkmark, muted green, 48px, perhaps with a subtle celebratory animation (one-time, gentle pulse or fade-in)
- **Headline:** "All caught up." — 24px, semibold, dark slate
- **Subtext:** "You've finished your inbox." — 15px, secondary text color
- **Action:** Optional "Close Linelo" button (outlined, secondary styling) to encourage the user to leave
- **No confetti, no streaks, no gamification** — The PRD explicitly prohibits guilt or engagement mechanics. The celebration is quiet satisfaction.

### Milestone States

At natural breakpoints, a subtle overlay or inline message appears momentarily:

- **"All high-priority messages handled"** — Shows when transitioning from urgent tier to lower priority
- **"You're in the low-priority tail"** — Appears when remaining messages are bulk/newsletters

#### Treatment

- Inline text, appearing above the message card briefly (2–3 seconds)
- Typography: 14px, medium weight, muted green color
- Optional: Subtle fade-in/fade-out animation
- Does not interrupt flow or require dismissal

### Loading State

When fetching the next message:

- **Duration:** Target < 300ms perceived latency (per PRD)
- **Visual:** The current message fades/slides out while the next fades/slides in
- **Skeleton:** If loading exceeds 300ms, show a skeleton of the message card:
  - Placeholder lines for sender, subject, body
  - Subtle pulse animation
  - Secondary text: "Loading next message..."

### Error States

#### Connection Lost

- Subtle banner at top of screen (not modal)
- Yellow-tinted background, dark text
- Message: "Connection lost. Your actions are saved and will sync when reconnected."
- Auto-dismisses when connection restored

#### Action Failed

- Inline error below the action buttons
- Muted coral color for text
- Message: "Couldn't [send reply/mark as handled]. Tap to retry."
- Includes retry button (text-style, not prominent)

---

## Interaction Patterns

### Transitions

All transitions should feel smooth and intentional, never jarring.

#### Message-to-Message Transition

- **Direction:** Next message slides in from the right while current slides left (implying forward motion through a queue)
- **Duration:** 200–250ms
- **Easing:** Ease-out-cubic for a natural deceleration
- **Opacity:** 100% → 0% for outgoing, 0% → 100% for incoming
- **Transform:** Translate X by 20–30px

#### Action Confirmation

- When an action is taken, brief visual feedback before transition:
  - **Reply sent:** Subtle green flash on the send button, then transition
  - **Handled:** Check icon fills/animates, then transition
  - **Delegate:** Forward icon animates, then transition
  - **Task added:** Quick toast confirmation "Task added" (auto-dismiss 1.5s)

### Gestures (Touch)

- **Swipe right:** Could map to "Reply" action (natural inbox gesture)
- **Swipe left:** Could map to "Handled" action (dismissive gesture)
- Gestures are secondary—buttons remain the primary interface
- Gesture hints should not appear unless user has discovered them

### Keyboard Navigation

Full keyboard support is required per the PRD:

| Key | Action |
|-----|--------|
| `R` | Focus/activate Reply |
| `H` | Activate "Handled" immediately |
| `D` | Focus/activate Delegate |
| `T` | Focus/activate Add Task |
| `Tab` | Navigate between actionable elements |
| `Enter` | Confirm focused action |
| `Escape` | Close any open modal/composer |
| `↑` / `↓` | Scroll message content |

#### Keyboard Shortcut Visibility

- Shortcuts appear as subtle indicators on buttons
- On first session, a dismissible tooltip explains keyboard shortcuts
- Shortcuts remain visible at all times (not hidden until discovered)

---

## Responsive Behavior

### Desktop (> 1024px)

- Full layout as described
- Message card max-width: 680px
- Generous whitespace on sides
- Action zone comfortably spaced

### Tablet (768px – 1024px)

- Message card expands to fill more horizontal space (max 90% viewport)
- Action buttons may wrap to 2x2 grid if space is tight
- AI suggestions stack vertically if needed

### Mobile (< 768px)

- **Header:** Simplified—logo left, settings icon right, no center progress text (moves to inline with message or is hidden)
- **Message card:** Full-width with minimal margin (16px sides)
- **Action zone:**
  - Fixed to bottom of screen (sticky)
  - AI suggestions become a horizontal scroll if more than 2
  - Core action buttons displayed as a 2x2 grid or remain in a row with smaller padding
  - Safe area padding at bottom for notched devices
- **Keyboard shortcuts:** Hidden on touch devices (no physical keyboard)
- **Gestures:** Swipe actions become more prominent as an alternative to buttons

---

## Accessibility

### WCAG Compliance Targets

- **Level:** WCAG 2.1 AA minimum
- **Color contrast:** All text meets 4.5:1 ratio (7:1 for small text where possible)
- **Touch targets:** Minimum 44x44px for all interactive elements

### Screen Reader Support

- Semantic HTML structure: `<header>`, `<main>`, `<article>`, `<footer>`
- ARIA landmarks for each zone
- Live regions for:
  - Message transitions ("Now showing message from [sender] about [subject]")
  - Action confirmations ("Message marked as handled")
  - Progress updates ("All high-priority messages complete")
- Button labels include full context (e.g., "Reply to message from Sarah Chen")

### Focus Management

- Focus moves to message card when new message appears
- Clear focus indicators on all interactive elements
- Logical tab order: Message content → AI suggestions → Core actions
- Skip link to jump directly to actions

### Reduced Motion

- Respect `prefers-reduced-motion` media query
- Disable slide transitions, use instant opacity changes
- Disable any celebratory animations

### Color Independence

- Icons accompany color-based states (e.g., checkmark for success, not just green)
- Error states include icon indicators, not just color change

---

## Component Specifications

### Message Card Component

```
Props:
- sender: { name, email, avatarUrl? }
- subject: string
- body: string (HTML or plain text)
- timestamp: Date
- thread?: { messageCount: number, preview: Message[] }
- attachments?: { name, type, size }[]
- explanation?: string (prioritization reason)

States:
- default
- loading (skeleton)
- scrollable (when content exceeds viewport)
```

### Action Button Component

```
Props:
- action: 'reply' | 'handled' | 'delegate' | 'task'
- label: string
- icon: IconComponent
- shortcut: string
- onAction: () => void
- emphasized?: boolean

States:
- default
- hover
- focus
- active/pressed
- loading (for async actions)
```

### Suggestion Chip Component

```
Props:
- suggestion: { action: ActionType, description: string, confidence: number }
- onSelect: () => void

States:
- default
- hover
- selected (brief flash on click)
```

### Progress Indicator Component

```
Props:
- phase: 'high-priority' | 'processing' | 'low-priority' | 'complete'
- showArc?: boolean

Renders:
- Contextual text based on phase
- Optional progress arc (no numbers)
```

---

## Micro-copy Guidelines

### Tone Alignment

Per brand guidelines, copy should be:
- Calm and grounded
- Short and declarative
- Specific about outcomes
- Free of pressure or urgency language

### Examples

| Context | Copy |
|---------|------|
| Progress (early) | "Working through your inbox" |
| Progress (high-priority done) | "High-priority messages handled" |
| Progress (low-priority tail) | "Low-priority tail" |
| Inbox zero | "All caught up." |
| Action: Reply | "Reply" |
| Action: Handled | "Handled" |
| Action: Delegate | "Delegate" |
| Action: Add Task | "Add Task" |
| Explanation example | "From a frequent contact" |
| Explanation example | "Contains deadline language" |
| Explanation example | "Newsletter, low engagement" |
| Error: Connection | "Connection lost. Actions will sync when reconnected." |
| Error: Action failed | "Couldn't send. Tap to retry." |
| Loading | "Loading next message..." |
| Task confirmation | "Task added" |

### Copy to Avoid

- "Only X messages left!" (creates pressure)
- "You're doing great!" (gamification)
- "Hurry!" or "Don't miss this" (urgency)
- "AI recommends..." (over-emphasizes AI)
- Any exclamation marks in progress indicators

---

## Animation & Motion Specifications

### Principles

- Motion serves clarity, not decoration
- All animations respect `prefers-reduced-motion`
- Duration: 150–300ms for micro-interactions, 200–400ms for transitions
- Easing: Ease-out for entrances, ease-in-out for state changes

### Defined Animations

| Animation | Duration | Easing | Description |
|-----------|----------|--------|-------------|
| Message enter | 250ms | ease-out-cubic | Slide from right + fade in |
| Message exit | 200ms | ease-in-cubic | Slide to left + fade out |
| Button hover | 150ms | ease-out | Scale 1.02, shadow increase |
| Button press | 100ms | ease-out | Scale 0.98 |
| Card hover | 200ms | ease-out | Shadow increase |
| Toast enter | 200ms | ease-out | Slide up + fade in |
| Toast exit | 150ms | ease-in | Fade out |
| Skeleton pulse | 1500ms | ease-in-out | Opacity 0.5 → 1 → 0.5 (loop) |
| Completion check | 400ms | spring | Scale 0 → 1.1 → 1 with subtle bounce |

---

## Summary

This design specification defines a queue screen that embodies Linelo's core promise: **finish your inbox calmly**. By constraining the interface to a single message and four clear actions, presenting AI suggestions as helpful options rather than commands, and treating progress as a feeling rather than a number, the design creates a focused, stress-free environment for email triage.

The visual language—warm off-white backgrounds, a muted green accent, generous whitespace, and restrained typography—reinforces the brand's positioning as counter-addictive software. Every element earns its place by supporting the singular goal: help the user make a decision and move forward.

The design intentionally leaves out:
- Inbox lists or message counts
- Skip or defer options
- Gamification or achievement mechanics
- Aggressive AI framing
- Visual noise or unnecessary ornamentation

What remains is calm, clarity, and resolution.
