# Linelo

A calm, open-source inbox that helps you finish email, one unread message at a time.

## Development

```sh
pnpm install
pnpm dev
```

That is all. Without further setup the server runs on an embedded PostgreSQL ([PGlite](https://pglite.dev)) stored in `.data/pglite`. Delete that folder to start over.

Settings live in two files, both gitignored:

- `.env` holds development settings and is what every command loads by default (`pnpm dev`, `pnpm db:*`, `pnpm build`). Start from `.env.example`.
- `.env.production` holds production settings and is only loaded when asked for: `pnpm build --dotenv .env.production`, `pnpm preview --dotenv .env.production`, `pnpm db:migrate:production` and `pnpm db:studio:production`. Start from `.env.production.example`, with its own `BETTER_AUTH_SECRET`.

To try the app without a Microsoft account, open [localhost:3000/api/auth/demo/sign-in](http://localhost:3000/api/auth/demo/sign-in). It signs you in to a demo mailbox with a handful of example threads and a few calendars, and the state resets when the dev server restarts. The demo mailbox exists in development only.

## Sign-in with Microsoft

Linelo signs people in with their Microsoft account, reads their Outlook inbox and sends their replies and forwards through Microsoft Graph. Sign-in, sessions and the stored tokens are handled by [Better Auth](https://better-auth.com), inside the app on its own database; OAuth tokens are encrypted at rest.

To sign in with a real account, register an app in [Microsoft Entra](https://entra.microsoft.com) (App registrations, New registration):

- Supported account types: _Accounts in any organizational directory and personal Microsoft accounts_.
- Redirect URI: platform _Web_, `http://localhost:3000/api/auth/callback/microsoft` (plus `https://<your-domain>/api/auth/callback/microsoft` for a deployment). Redirect URIs cannot contain wildcards, so preview deployments cannot sign in until they get a fixed URI of their own.
- API permissions: Microsoft Graph, delegated, as in the table below. Linelo never sends mail on its own: only the replies and forwards you write, when you press Send or Forward.
- Certificates & secrets: create a client secret. It expires after at most 24 months; put a reminder in the calendar and rotate it before then.

| Permission                                                  | Why                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `openid`, `profile`, `email`, `offline_access`, `User.Read` | Sign-in, and a refresh token so Linelo keeps working without asking again.                                                   |
| `Mail.ReadWrite`                                            | The smallest permission that can mark mail as read.                                                                          |
| `Mail.Send`                                                 | Sends the replies and forwards you write, and nothing else.                                                                  |
| `Calendars.ReadWrite`                                       | Shows the main calendar, reads the other calendars in the account's calendar list, and writes the copies of accepted events. |

Microsoft asks for all of them at once at sign-in. An account that signed in before `Calendars.ReadWrite` was added is asked to sign in again on its next token refresh, and Microsoft's consent screen then lists what is new. The mail permissions are checked against what the account granted when it was created (Better Auth does not rewrite the stored scopes on a repeat sign-in), so an account from before `Mail.Send` has to be removed and signed in afresh.

Then set, in `.env` and `.env.production`:

| Variable                  | Purpose                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MICROSOFT_CLIENT_ID`     | The app registration's _Application (client) ID_.                                                                                |
| `MICROSOFT_CLIENT_SECRET` | The client secret's _value_.                                                                                                     |
| `BETTER_AUTH_SECRET`      | Signs sessions and encrypts the tokens, at least 32 random characters (`openssl rand -base64 32`). Required outside development. |
| `BETTER_AUTH_URL`         | The public origin, such as `https://linelo.example`. Required outside development, where it defaults to `http://localhost:3000`. |

Without the Microsoft variables the dev server logs that sign-in with Microsoft is off; the demo mailbox still works.

People of other organisations can only sign in once the app's publisher is verified (Microsoft's risk-based consent blocks unverified multi-tenant apps for them); personal accounts and accounts of the organisation that registered the app work right away. When an organisation requires admin approval, its IT admin grants consent for the app.

## Ranking

The inbox shows one unread message at a time, best first: mail from people you write to, addressed to you, that asks something of you and is time-bound comes first; newsletters and notifications come last, with _Mark as handled_ suggested. The info icon next to the subject says why a message is shown now, from the two reasons that moved it most.

- **Rules** (`server/ranking/score.ts`) always run. They score every message from facts: how it is addressed, your flag in Outlook, the sender's importance mark, Outlook's Focused and Other, a List-Unsubscribe header, automated sender addresses (`no-reply@…`), a few time words in English and German, its age, and your standing with the sender: how often and how recently you wrote to them, from the newest 500 messages in Sent Items, scanned once a day. Mailing lists from senders you never write to stay in the lowest tier, and a message you flagged never sinks.
- **Jev**, a hosted model by [TypeSafe AI](https://typesafe.ai), answers three questions about the complete text of every unread message: does it ask you to do or answer something, was it sent by a system or to a list, and how soon is something needed. Its confident answers move the score by at most 20 points, urgency only half as much from senders you never write to. _Mark as handled_ is suggested for mailing lists, automated senders and what Jev calls automated, never for a message you flagged; it carries the AI badge where Jev's reading is behind it. When Jev does not answer, the rules' order stands and Jev is asked again ten minutes later at the earliest.

Reading every unread message in full takes longer than a page load, so Linelo keeps an index of the unread mail and syncs it while the inbox is open: in steps of about eight seconds, one at a time per mailbox, newest mail first. A login with nothing ranked worth showing (the first one, or after a finished inbox) reads the newest 50 messages first and shows the best of them after a few seconds; any other login shows a message at once while the sync catches up behind it. Mail is only read while Linelo is open.

What leaves the server: the complete text of every unread Inbox message goes to TypeSafe once (and again when the model version or the questions change), with the sender's name and domain, how the mail is addressed and the subject. No address fields, attachments, earlier messages of the thread or ids. TypeSafe hosts Jev in the United States, does not train on inputs and keeps data "as long as necessary"; zero data retention is an enterprise option. Outside development there is no mode without the model, so a self-hosted Linelo sends the same under its own key. Before anyone other than you uses a hosted instance, put a data processing agreement with TypeSafe in place and name them as a processor.

What is stored: `unread_messages` holds one row per unread message (message and conversation ids, facts, Jev's probabilities, the score, timestamps), `mailbox_profiles` one per mailbox (whom it writes to, as keyed hashes of the addresses, and when it was last scanned, listed and synced). No subject, text or readable address. The hashes are HMAC-SHA-256 with a key derived from `BETTER_AUTH_SECRET`; a new secret rescans Sent Items. A message you resolved in Linelo that the mailbox still lists as unread two minutes later (marked unread again in Outlook, or a reply whose marking as read failed) comes back: the mailbox stays the truth.

| Variable           | Purpose                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY` | TypeSafe AI's API key for Jev. Required outside development. Without it the dev server ranks mail other than the demo mailbox by the rules alone and logs that once. |
| `JEV_MODEL`        | Optional: another Jev version than the pinned `jev-1.14.0`, to try it before the pin changes. Messages judged by another version are judged again by the next syncs. |

The inbox API, as the page uses it, one request to the mailbox at a time (Outlook allows about four at once, and a sync step uses them):

1. `GET /api/inbox?limit=4&start=1` on the first request of a session only; `limit` is 1 to 20. With `preparing: true` there is nothing worth showing yet:
2. `POST /api/inbox/sync` with `{ "start": true }`, the starting batch (the newest 50 messages read and judged), then `GET /api/inbox?limit=4` without `start`.
3. `POST /api/inbox/sync` with `{ "start": false }` until it answers `{ "status": "done" }`; on `busy` (another tab is syncing the mailbox) a second's wait before asking again. Then `GET /api/inbox?limit=20`, which the page also asks for when two items are left.
4. After an action, a sync once the last one is two minutes old, then `GET` again; after Undo, a sync, so a message a listing removed meanwhile comes back.

The demo mailbox never calls Jev: its judge gives the answers Jev gave about each example message when it was last asked, frozen in `server/ranking/judges/demo-answers.json`. `pnpm ranking:demo-answers` asks again, with `TYPESAFE_API_KEY` in `.env` and one call per example message, and updates the demo's order in `test/unit/ranking-golden.spec.ts`. Run it after changing an example thread, the questions or the pinned model. When a "why shown" line changes with it, the golden spec names the line to change in `shared/data/inbox-fixtures.ts`.

Every sync step that asked Jev logs one line with the number of messages judged and the input tokens they cost. In development the server also logs each item's score and factors, so an odd order can be traced to a factor and the weights changed in `server/ranking/score.ts`. The weights are first guesses, checked against the demo threads (`test/unit/ranking-golden.spec.ts`) and nothing else yet.

## Calendar

`/calendar` shows the week of the account's main calendar, its default calendar in Outlook, as a list grouped by day. Other calendars are never overlaid. Instead, Linelo suggests their events in place, in the week, one decision each:

- Choose the other calendars under _Calendars…_ in the account menu. Any calendar in the account's own calendar list can be chosen: secondary calendars, and calendars people shared with you once you accepted the invitation in Outlook. Microsoft 365 group calendars and ICS links are not supported yet.
- Every event of a chosen calendar that has no decision yet shows as a dashed suggestion row. _Accept_ (`A`) copies it into the main calendar, _Not for me_ (`N`) dismisses it for good; Undo on the toast takes either back. A recurring series is one decision and is copied as a series from its next occurrence on. Events that are in the main calendar already (the same meeting invitation) and private events are not suggested.
- Copies follow their original: whenever the calendar page opens, Linelo compares them with their sources and updates times, title, place and pattern. A copy you edited in Outlook keeps your title, notes and place and still takes the new times. A cancelled source removes its copy and says so. A calendar that stops answering is reported and its copies stay. Copies are not updated while nobody opens the calendar page.
- Linelo stores no event content, only ids and versions (`calendar_sources`, `calendar_decisions`).

Formats are `en-GB`, 24-hour, Monday first, in the viewer's time zone. The demo sign-in comes with demo calendars too; their copies live in memory, and every demo sign-in starts them afresh.

When Graph refuses calendar access (the permission was never granted, or was revoked at [myapps.microsoft.com](https://myapps.microsoft.com)), the calendar page offers _Allow calendar access_, which runs the ordinary sign-in with Microsoft and comes back to the calendar.

## Database

Linelo runs on PostgreSQL. The hosted instance uses [Neon](https://neon.com); a self-hosted instance can use any PostgreSQL 17.

- `DATABASE_URL` selects the database. Unset or empty, the dev server falls back to PGlite; outside development it is required and the server refuses to start without it. `neon env pull --file .env.production` writes it to `.env.production` from the linked Neon project (see `.neon`), together with `DATABASE_URL_UNPOOLED`, which migrations use when present. Without `--file` it writes to `.env`, which would point development at production.
- The schema lives in `server/db/schema.ts`, written with [Drizzle ORM](https://orm.drizzle.team).
- After changing the schema, run `pnpm db:generate`. It writes a migration to `server/db/migrations`; commit it together with the schema change. A unit test fails when the two drift apart.
- Migrations run automatically in development, whenever the dev server starts. For production they run during `nuxt build` when `DATABASE_URL` is set, so a deployment whose build can reach the database migrates itself; a build without it (CI, a container image) only ships the folder in `.output/server/db/migrations`, and `pnpm db:migrate:production` (or `pnpm db:migrate` with the deployment's environment) applies it before the new version starts. The server itself never migrates.
- `pnpm db:studio` opens Drizzle Studio to browse the development data, `pnpm db:studio:production` the production data.
- `GET /api/health` answers `{ "status": "ok" }` while the database is reachable.
