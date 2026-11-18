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

Linelo signs people in with their Microsoft account and reads their Outlook inbox through Microsoft Graph. Sign-in, sessions and the stored tokens are handled by [Better Auth](https://better-auth.com), inside the app on its own database; OAuth tokens are encrypted at rest.

To sign in with a real account, register an app in [Microsoft Entra](https://entra.microsoft.com) (App registrations, New registration):

- Supported account types: _Accounts in any organizational directory and personal Microsoft accounts_.
- Redirect URI: platform _Web_, `http://localhost:3000/api/auth/callback/microsoft` (plus `https://<your-domain>/api/auth/callback/microsoft` for a deployment). Redirect URIs cannot contain wildcards, so preview deployments cannot sign in until they get a fixed URI of their own.
- API permissions: Microsoft Graph, delegated, as in the table below. Linelo never sends mail on its own.
- Certificates & secrets: create a client secret. It expires after at most 24 months; put a reminder in the calendar and rotate it before then.

| Permission                                                  | Why                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `openid`, `profile`, `email`, `offline_access`, `User.Read` | Sign-in, and a refresh token so Linelo keeps working without asking again.                                                   |
| `Mail.ReadWrite`                                            | The smallest permission that can mark mail as read.                                                                          |
| `Calendars.ReadWrite`                                       | Shows the main calendar, reads the other calendars in the account's calendar list, and writes the copies of accepted events. |

Microsoft asks for all of them at once at sign-in. An account that signed in before a permission was added is asked to sign in again on its next token refresh, and Microsoft's consent screen then lists what is new.

Then set, in `.env` and `.env.production`:

| Variable                  | Purpose                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MICROSOFT_CLIENT_ID`     | The app registration's _Application (client) ID_.                                                                                |
| `MICROSOFT_CLIENT_SECRET` | The client secret's _value_.                                                                                                     |
| `BETTER_AUTH_SECRET`      | Signs sessions and encrypts the tokens, at least 32 random characters (`openssl rand -base64 32`). Required outside development. |
| `BETTER_AUTH_URL`         | The public origin, such as `https://linelo.example`. Required outside development, where it defaults to `http://localhost:3000`. |

Without the Microsoft variables the dev server logs that sign-in with Microsoft is off; the demo mailbox still works.

People of other organisations can only sign in once the app's publisher is verified (Microsoft's risk-based consent blocks unverified multi-tenant apps for them); personal accounts and accounts of the organisation that registered the app work right away. When an organisation requires admin approval, its IT admin grants consent for the app.

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
