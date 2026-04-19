# Linelo Inbox MVP PRD

## Document Status

- Status: Draft
- Date: 2026-04-16
- Scope: Inbox MVP

## Brand Reference and Context

This PRD uses [BRAND.md](./BRAND.md) as the source of truth for product promise, positioning, workflow philosophy, tone, and strategic guardrails.

Key brand constraints that govern this PRD:

- Linelo helps users **finish email**, not manage it indefinitely.
- The core workflow is **one message, one decision**.
- The product must **reduce pressure**, not create vigilance loops.
- AI is **assistive and quiet**, not the primary interface.
- Attention protection matters more than feature density.

## Strategic Context

### Why Now

Three converging trends make this product viable today:

1. **LLM maturity for structured tasks.** Language models can now reliably classify email intent, extract urgency signals, and draft contextual replies at consumer-grade latency. This was not cost-effective or accurate enough even 18 months ago.
2. **Inbox fatigue is worsening, not improving.** Despite decades of email clients, average unread counts continue to climb. Existing tools optimize for management (labels, filters, snooze) rather than resolution. The problem space is under-served by a completion-oriented approach.
3. **Growing demand for counter-addictive software.** Users are increasingly skeptical of engagement-maximizing products. A tool that explicitly protects attention and optimizes for session exit is culturally aligned with a growing segment.

### Competitive Landscape

Linelo does not compete primarily with Gmail, Outlook, or Apple Mail. Those are infrastructure. Linelo competes with:

- **Superhuman, Shortwave, Spark:** Speed-oriented clients that still center on the inbox list. They reduce friction per message but do not change the underlying decision model. Users still choose what to look at, which preserves the cognitive burden of prioritization.
- **SaneBox, Clean Email:** Rule-based triage layers. Effective at filtering, but they shift complexity to configuration rather than eliminating it. They also require ongoing maintenance.
- **Hey (Basecamp):** Closest in philosophy — opinionated, workflow-driven. But Hey's model is still navigation-based (Imbox, Feed, Paper Trail). It organizes email into lanes rather than enforcing resolution.

Linelo's differentiator is structural: the user never chooses which message to look at, and cannot advance without acting. This is a fundamentally different interaction model, not an incremental improvement on an existing one.

## Goals and Success Metrics

### Primary Goal

Help overwhelmed professionals **finish their inbox** through a fast, decisive, one-message-at-a-time workflow.

### Product Goals

- Reduce the time and mental effort required to decide what to do next.
- Increase the rate at which unread messages move to a **terminal state**.
- Maintain a sense of forward progress without requiring inbox navigation.
- Validate that a forced-decision workflow can outperform conventional inbox management.

### Success Metrics

**Primary metrics:**

- Messages resolved per 10-minute session
- Median decision time per message

**Supporting metrics:**

- Account connection completion rate
- Percentage of users who take a first action in their first session
- Messages resolved per active session
- Percentage of sessions that reach inbox zero
- Action distribution across:
  - Reply
  - Mark as handled
  - Delegate
  - Add to Todoist

- Percentage of sessions abandoned mid-flow, and drop-off point distribution
- Time-to-action distribution by action type

### Success Criteria for v1

- Users can connect a Microsoft account and immediately enter the decision flow
- Users can process messages continuously without reorienting to an inbox view
- Users understand why each message is shown
- All core actions are fast, reliable, and repeatable at scale
- A meaningful share of users can reach inbox zero in-session

## Target User and Jobs-to-be-Done

### Primary User

Overwhelmed professionals with high inbound email volume (founders, operators, consultants, managers, knowledge workers).

### User Characteristics

- Receives enough email that unread backlog creates avoidance
- Struggles to quickly distinguish signal from noise
- Wants **closure**, not organization
- Prefers pragmatic, controlled tools over noisy or addictive ones

### Core Jobs-to-be-Done

- Help me decide what deserves attention next
- Help me move each message to a clear outcome
- Help me clear low-value email quickly without fear of missing something
- Help me get through email with less ambiguity and mental drag
- Help me feel like I made real progress, not just reshuffled messages

## Product Principles

- **Resolution over management:** every message must reach a terminal state
- **Forced clarity:** no passive reading or ambiguous states
- **One decision at a time:** no list-based navigation as primary workflow
- **Calm by design:** minimize visible options and cognitive overhead
- **AI as support, not interface:** guide decisions, don’t replace them
- **Attention protection:** avoid loops, feeds, or engagement mechanics
- **Transparent prioritization:** always explain why a message is shown

## Core Interaction Model

### Resolution Model (Strict)

Every message must end in one of four **terminal actions**:

- Reply
- Mark as handled
- Delegate (forward)
- Add to task manager

There is:

- No skip
- No defer
- No "mark as read" without intent

#### Design Rationale

The absence of skip and defer is the product's most opinionated constraint and its most important one. Skip creates an accumulating backlog of avoided decisions. Defer creates a second inbox of postponed obligations. Both undermine the core promise of resolution.

This constraint is also the highest-risk element of the design. If users encounter a message they genuinely cannot act on (missing context, waiting on someone else, not enough time to reply properly), the lack of an escape valve may feel coercive. The mitigation is to ensure that "add to task manager" serve as legitimate resolution paths for these cases, and to monitor whether users experience the constraint as liberating or frustrating.

### Definition of Actions

**Reply**

- User sends a response (AI-assisted or manual)
- Message exits queue immediately after sending

**Mark as handled**

- Message requires no action OR was handled outside email
- One-tap action
- No confirmation
- Monitored for overuse as a signal of model or UX problems

**Delegate**

- Message is forwarded with optional note
- No tracking of outcome
- Considered complete

**Add to task manager**

- Task is created instantly (title + link to email)
- Email is considered resolved
- Optional edit after creation
- In v1, Todoist is the only supported integration

### Key Constraint

> The system enforces a decision before advancing. Users cannot proceed without selecting an action.

### Edge Cases and Boundaries

- **Message arrives during session:** The newly received message enters the ranking pipeline immediately. It may appear as the next message if ranked highly, but it does not interrupt the current message.
- **Thread with multiple unread messages:** Each unread message in a thread is a separate queue entry. The system may group them by showing the most recent first and auto-resolving earlier messages in the thread if the user acts on the latest one. Exact threading behavior is a design question to resolve during implementation.
- **Message the user truly cannot act on:** "Add to task manager" is the intended escape path. The system should not create pressure to reply when the right action is to defer the work, not the email.
- **Very long messages or complex threads:** The message display should truncate intelligently, showing enough context to decide. If the user needs the full thread, they can expand it, but the default view should optimize for decision speed.

## Queue and Prioritization Model

### Core Behavior

- System maintains a dynamically ranked set of unread messages
- Only **one message is ever shown**
- The underlying queue is **not visible to the user**
- Re-ranking of newly received emails occurs after an action is taken (i.e., they may appear as the next message after the current action)

### Prioritization Approach

- Hybrid model:
  - AI-based ranking
  - Deterministic fallback rules when confidence is low

#### Ranking Architecture

Use a **two-stage hybrid system**:

**Stage A**: Deterministic Scoring Layer (Primary)

- Fast, explainable
- Always runs
- Produces:
  - Base priority score
  - Structured feature vector
  - Explanation candidates

**Stage B**: AI Adjustment Layer (Secondary)

- Optional modifier (bounded influence)
- Only applies when confidence is high
- Cannot override hard rules

#### Feature Model (Deterministic Layer)

Each message is scored across multiple dimensions:

1. **Urgency** using signals like imperative language ("please send", "need", "ASAP") or time references ("today", "by EOD", dates)

2. **Sender importance** derived from user interaction history and organizational signals (reply frequency, recency of correspondence, domain matching)

3. **Cognitive load indicators** such as email length, number of participants, attachments, and complexity cues (e.g., multiple questions, dense text). Lower-load messages are interleaved with higher-load ones to prevent decision fatigue.

4. **Bulk / Low-value detection**, especially for newsletters, marketing emails, and notifications, using explicit signals (unsubscribe headers, list-id, known bulk sender patterns).

5. **Recency** as a tiebreaker, with a mild bias toward newer messages within the same priority tier.

#### AI Adjustment Layer

Input:

- Email content (truncated)
- Thread summary (if available)
- Feature vector from deterministic layer

Output:

- Adjusted priority score (bounded)
- Optional explanation modifier
- Confidence signal (determines whether adjustment is applied)

### Low-Value Email Handling

- Low-value messages (e.g., newsletters, bulk notifications) are:
  - Heavily deprioritized
  - Accompanied by a suggested action: **"Mark as handled"**

- No automatic filtering or hiding in v1

## Completion Model

### Definition of Done

> The system reaches completion only when **all unread messages are processed**.

- No artificial or partial completion states (at least in v1)
- Inbox zero is the only terminal state

### Progress Perception

- System provides **lightweight progress signals** (e.g., "You've handled all urgent messages")
- Does not display total remaining count
- Rationale: showing the remaining count creates anxiety and makes the task feel like a chore. The product should feel like forward motion, not a countdown. This is a deliberate trade-off: some users will want to know how much is left, but the default experience optimizes for calm.

### Milestone Signals

The system can provide positive, non-pressuring signals at natural breakpoints:

- "All high-priority messages handled" (when no remaining messages score above the urgency threshold)
- "You're in the low-priority tail" (when remaining messages are predominantly bulk/low-value)
- "Inbox zero" (terminal state)

These signals help users decide whether to continue or stop without creating pressure to finish.

### Action Suggestion Model

For each message, the system suggests **structured actions**, not just text:

Examples:

- "Reply — accept the request"
- "Reply — decline with reason"
- "Mark as handled — no action needed"
- "Add to Todoist — deadline Friday"

Suggestions are generated by the AI layer based on message content and intent classification. The system should offer 2–3 suggestions per message. More than three creates decision overhead that defeats the purpose.

### Reply Generation

- Selecting a suggested action:
  - Pre-fills a reply draft
  - User can edit or send immediately

- Goal: minimize decision + writing effort
- Generated replies must match the user's typical tone and length. In v1, this calibration is limited, so generated replies should default to concise and professional. Tone matching is a post-MVP improvement.

## User Interaction and Design

### Interaction Goals

- Immediate clarity on what to do next
- Minimal cognitive overhead per decision
- Continuous forward motion without reorientation

### Design Rules

- One primary focus: the current message
- Persistent visibility of available actions
- No inbox table or list as primary UI
- High whitespace, low noise
- No gamification or urgency mechanics

### Expected UI Behavior

- Current message is centered
- Supporting context is available without overwhelming the main view
- Explanation and suggested actions are visible but unobtrusive
- Transition to next message is immediate (< 300ms perceived)
- Actions feel physical and decisive: clear visual confirmation that the action was taken, then immediate transition

### Session Flow

A typical session follows this arc:

1. **Entry:** User opens Linelo. First message appears immediately (no loading screen, no dashboard, no summary).
2. **High-priority processing:** First 5–10 messages are the most important. Decision speed is typically fastest here.
3. **Mid-session:** Mix of medium-priority and some low-value messages. Pace may slow as messages require more thought.
4. **Low-priority tail:** Predominantly bulk, newsletters, notifications. "Mark as handled" dominates. Pace accelerates again.
5. **Completion or exit:** User either reaches inbox zero or decides to stop. Both are valid outcomes.

The system should feel equally good at step 5 whether the user finished or chose to stop. No guilt mechanics.

### Accessibility and Usability

- Full keyboard support for all actions
- Clear visual hierarchy for long sessions
- No reliance on AI literacy

## Core User Flows

### 1. Connect Account

1. User starts onboarding
2. System explains what access is needed and why, in plain language
3. User connects Microsoft account via OAuth
4. System fetches unread messages and runs initial ranking
5. User lands directly on first message in the queue

**Success condition:**

- The user reaches the first actionable unread message without manual configuration.

### 2. Process Message

1. System shows next message
2. System explains, briefly, why it is shown (configurable, default off)
3. AI suggests possible actions (2–3 structured suggestions)
4. User reads enough context to decide
5. User selects or customizes an action
6. System executes action and updates message state
7. System suggests follow-up if applicable (e.g., "Create a task for the deadline mentioned?")
8. Next message appears

**Success condition:**

- Continuous flow without needing inbox navigation

## Functional Requirements

### Account Connection

- Microsoft authentication for single user
- Minimal required permissions
- Clear explanation of access
- Graceful recovery from auth failure

### Inbox Ingestion

- Fetch unread messages
- Maintain dynamic prioritization layer
- Do not re-surface messages once resolved/read

### Prioritization

- Rank messages continuously
- The ranking model should use AI and deterministic rules.
- Provide single-line explanation for why the current message is surfaced (configurable, default off)
- The system must allow product iteration on ranking quality without breaking the core workflow.

### Message Display

- Show sender, subject, timestamp, content
- Provide sufficient thread context (latest messages prioritized)
- Keep actions visible and accessible
- The system must support composing and sending a manual reply.

### Action Execution

- All actions must complete in **one interaction**
- Reply:
  - AI-assisted drafting

- Mark as handled:
  - Instant, no confirmation
  - Marks as read in Microsoft account

- Delegate:
  - Forward + optional note

- Task manager:
  - Instant task creation in Todoist (title + link to email)
  - Optional edit after creation
  - Requires one-time Todoist account connection

### Progress and State

- Preserve user position across sessions
- Sync message state bidirectionally with Microsoft account
- Provide clear completion state (inbox zero)
- Handle offline/connectivity issues gracefully (queue actions for retry, don't lose user work)

### Preferences and Controls

- The system must not require folder configuration, label design, or custom rules setup before first value
- Configurable controls in v1:
  - Prioritization explanation visibility (on/off, default off)
  - Todoist workspace/project selection
  - Account disconnection

### Telemetry

Capture:

- Action taken per message
- Time to decision
- Session length and drop-off point
- Action distribution over session progression

Telemetry must remain privacy-conscious and transparent

## Non-Goals in v1

- Multi-provider inbox support (Gmail, IMAP)
- Team workflows or shared inboxes
- Self-hosting (planned for post-MVP but not in scope)
- AI-generated summaries as a standalone feature
- Autonomous actions (AI acts without user confirmation)
- Folder/label management
- Chat-based interaction model
- Engagement optimization features
- Mobile native app (web-first in v1)
- Calendar or scheduling integration

## Risks

### 1. Prioritization quality is critical

- No skip or defer means bad ranking immediately degrades UX

### 2. “Mark as handled” overuse

- May become a catch-all for ambiguity
- Reduces data quality and system learning

### 3. End-of-inbox fatigue

- As high-value messages are processed first, remaining messages become:
  - harder
  - less clear

- Users may abandon before reaching zero

### 4. Early-session failure sensitivity

- Poor early message selection can cause immediate drop-off

## Future Considerations

- Improved prioritization signals and confidence handling
- Better handling of long threads and context depth
- Optional post-session reflection or summary ("You handled 47 messages in 12 minutes")
- Tone calibration for AI-generated replies based on user writing history
- Self-hosting support with local LLM inference
- Batch actions for obvious low-value clusters (post-MVP, when classification confidence is proven)
- Mobile-optimized experience
