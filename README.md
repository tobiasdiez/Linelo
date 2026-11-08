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

To try the app without a Microsoft account, open [localhost:3000/api/auth/demo/sign-in](http://localhost:3000/api/auth/demo/sign-in). It signs you in to a demo mailbox with a handful of example threads and the state resets when the dev server restarts. The demo mailbox exists in development only.

## Sign-in with Microsoft

Linelo signs people in with their Microsoft account and reads their Outlook inbox through Microsoft Graph. Sign-in, sessions and the stored tokens are handled by [Better Auth](https://better-auth.com), inside the app on its own database; OAuth tokens are encrypted at rest.

To sign in with a real account, register an app in [Microsoft Entra](https://entra.microsoft.com) (App registrations, New registration):

- Supported account types: _Accounts in any organizational directory and personal Microsoft accounts_.
- Redirect URI: platform _Web_, `http://localhost:3000/api/auth/callback/microsoft` (plus `https://<your-domain>/api/auth/callback/microsoft` for a deployment). Redirect URIs cannot contain wildcards, so preview deployments cannot sign in until they get a fixed URI of their own.
- API permissions: Microsoft Graph, delegated: `openid`, `profile`, `email`, `offline_access`, `User.Read` and `Mail.ReadWrite` (the smallest permission that can mark mail as read). Linelo never sends mail on its own.
- Certificates & secrets: create a client secret. It expires after at most 24 months; put a reminder in the calendar and rotate it before then.

Then set, in `.env` and `.env.production`:

| Variable                  | Purpose                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MICROSOFT_CLIENT_ID`     | The app registration's _Application (client) ID_.                                                                                |
| `MICROSOFT_CLIENT_SECRET` | The client secret's _value_.                                                                                                     |
| `BETTER_AUTH_SECRET`      | Signs sessions and encrypts the tokens, at least 32 random characters (`openssl rand -base64 32`). Required outside development. |
| `BETTER_AUTH_URL`         | The public origin, such as `https://linelo.example`. Required outside development, where it defaults to `http://localhost:3000`. |

Without the Microsoft variables the dev server logs that sign-in with Microsoft is off; the demo mailbox still works.

People of other organisations can only sign in once the app's publisher is verified (Microsoft's risk-based consent blocks unverified multi-tenant apps for them); personal accounts and accounts of the organisation that registered the app work right away. When an organisation requires admin approval, its IT admin grants consent for the app.

## Database

Linelo runs on PostgreSQL. The hosted instance uses [Neon](https://neon.com); a self-hosted instance can use any PostgreSQL 17.

- `DATABASE_URL` selects the database. Unset or empty, the dev server falls back to PGlite; outside development it is required and the server refuses to start without it. `neon env pull --file .env.production` writes it to `.env.production` from the linked Neon project (see `.neon`), together with `DATABASE_URL_UNPOOLED`, which migrations use when present. Without `--file` it writes to `.env`, which would point development at production.
- The schema lives in `server/db/schema.ts`, written with [Drizzle ORM](https://orm.drizzle.team).
- After changing the schema, run `pnpm db:generate`. It writes a migration to `server/db/migrations`; commit it together with the schema change. A unit test fails when the two drift apart.
- Migrations run automatically in development, whenever the dev server starts. For production they run during `nuxt build` when `DATABASE_URL` is set, so a deployment whose build can reach the database migrates itself; a build without it (CI, a container image) only ships the folder in `.output/server/db/migrations`, and `pnpm db:migrate:production` (or `pnpm db:migrate` with the deployment's environment) applies it before the new version starts. The server itself never migrates.
- `pnpm db:studio` opens Drizzle Studio to browse the development data, `pnpm db:studio:production` the production data.
- `GET /api/health` answers `{ "status": "ok" }` while the database is reachable.
