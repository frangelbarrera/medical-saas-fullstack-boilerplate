# Prisma Migrations

This directory contains Prisma ORM database migrations. Migrations are the
source of truth for the database schema in production.

## Commands

```bash
# Create a new migration after editing prisma/schema.prisma
npm run prisma:migrate -- --name <descriptive_name>

# Apply all pending migrations to the database
npm run prisma:deploy

# Open Prisma Studio (GUI for browsing data in dev)
npm run prisma:studio

# Regenerate the Prisma Client after schema changes
npm run prisma:generate
```

## Initial Setup

1. Ensure `DATABASE_URL` is set in your `.env` file.
2. Run `npm run prisma:deploy` to apply the initial migration.
3. Run `npm run prisma:generate` to generate the Prisma Client.

## How Migrations Work

- Each migration is a directory with a timestamp prefix and a `migration.sql` file.
- Migrations are applied in order. Never edit an applied migration — create a new one instead.
- The `prisma/migrations` directory IS committed to git. It is the deployment artifact for schema changes.
- The Prisma Client (`node_modules/.prisma/client/`) is regenerated on `npm install` and is NOT committed.

## Row-Level Security (RLS)

The Prisma schema defines the structure, but RLS policies (multi-tenant
isolation at the DB level) are NOT managed by Prisma. They are defined in
`schema.sql` at the project root. To enable RLS in production:

```bash
psql $DATABASE_URL -f schema.sql
```

This is a one-time operation after the initial Prisma migration.
