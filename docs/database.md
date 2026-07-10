# Database

QSCM uses Postgres with Drizzle ORM for durable application data. MDX files remain
the source of truth for post bodies; database rows store metadata, access rules,
engagement, subscriptions, podcast feed state, webhook logs, and audit history.

## Environment

Create a local `.env.local` file with a Postgres connection string:

```bash
DATABASE_URL=postgres://qscm:qscm@localhost:5432/qscm
SEED_ADMIN_EMAIL=admin@example.local
```

Do not commit real connection strings or provider credentials. Local `.env*`
files are ignored by git.

Database commands load `.env.local` first and then `.env`, so the documented
local setup works without exporting variables in every terminal session.

Production should use a managed Postgres provider that supports point-in-time
recovery, encrypted storage, restricted network access, and separate credentials
for migrations/runtime access. The production `DATABASE_URL` must be configured
in Vercel and any CI job that applies migrations.

## Commands

Install dependencies:

```bash
npm install
```

Generate migrations from the typed schema:

```bash
npm run db:generate
```

Apply migrations to the database in `DATABASE_URL`:

```bash
npm run db:migrate
```

Seed the first publication, admin user/role, and sample tiers:

```bash
npm run db:seed
```

The seed is idempotent. It upserts the `qscm` publication, creates or refreshes
the admin user from `SEED_ADMIN_EMAIL` (defaulting to `admin@example.local`),
grants that user the `admin` role, and upserts the `supporter` and
`founding-member` tiers with monthly and annual prices.

## Local Verification

1. Start or provision a local Postgres database.
2. Set `DATABASE_URL` in `.env.local`.
3. Run `npm run db:migrate`.
4. Run `npm run db:seed`.
5. Run `npm run build`.

## Schema Coverage

The initial schema includes:

- identity: users, roles, OAuth/email accounts, sessions, magic links, account-linking records
- subscribers: subscriber lifecycle status, preferences, email provider sync state
- subscriptions: tiers, prices, Stripe/free/gift/admin-comped subscriptions, entitlement grants
- content overlays: publication records, MDX metadata, source path/hash, access rules, overlays
- engagement: private comment fields, moderation audit entries, persisted likes, share events, anonymous actor hashes
- podcast/media: media assets, shows, episodes, private feed token hashes, token audit events
- operations: webhook event logs with provider/event uniqueness, admin audit logs

## Backup And Recovery Baseline

Before launch, production Postgres must have managed backups enabled with:

- point-in-time recovery
- daily logical or provider-native backups retained for the provider's agreed retention window
- documented owner for backup health checks and restore execution
- separate non-production database available for restore drills

Restore drill:

1. Select a recent backup or point-in-time timestamp.
2. Restore into a non-production database, never directly over production.
3. Run migrations if the restored database is behind the current app schema.
4. Run smoke checks against restored publication, subscriber, subscription, entitlement, webhook, and audit data.
5. Record the restore timestamp, operator, source backup, duration, and verification result.

This repository documents the baseline and schema needed for backups. Actual
provider backup settings and a tested non-production restore require provider
access and should be tracked separately from this code change.
