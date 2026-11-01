# Linelo

A calm, open-source inbox that helps you finish email, one unread message at a time.

## Development

```sh
pnpm install
pnpm dev
```

That is all. Without further setup the server runs on an embedded PostgreSQL ([PGlite](https://pglite.dev)) stored in `.data/pglite`. Delete that folder to start over.

## Database

Linelo runs on PostgreSQL. The hosted instance uses [Neon](https://neon.com); a self-hosted instance can use any PostgreSQL 17.

- `DATABASE_URL` selects the database. Unset, the dev server falls back to PGlite; outside development it is required and the server refuses to start without it. `neon env pull` writes it to `.env` from the linked Neon project (see `.neon`), together with `DATABASE_URL_UNPOOLED`, which migrations use when present.
- The schema lives in `server/db/schema.ts`, written with [Drizzle ORM](https://orm.drizzle.team).
- After changing the schema, run `pnpm db:generate`. It writes a migration to `server/db/migrations`; commit it together with the schema change. A unit test fails when the two drift apart.
- Migrations run automatically in development, whenever the dev server starts. For production they run during `nuxt build` when `DATABASE_URL` is set, so a deployment whose build can reach the database migrates itself; a build without it (CI, a container image) only ships the folder in `.output/server/db/migrations`, and `pnpm db:migrate` applies it before the new version starts. The server itself never migrates.
- `pnpm db:studio` opens Drizzle Studio to browse the data.
- `GET /api/health` answers `{ "status": "ok" }` while the database is reachable.
