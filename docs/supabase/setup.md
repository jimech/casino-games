# Supabase Setup

Use Supabase as the hosted PostgreSQL database for the casino backend.

## Manual Step 1 - Create Project

Create a Supabase project from the dashboard:

```text
https://supabase.com/dashboard
```

Recommended project name:

```text
casino-games
```

Save the database password somewhere safe. Do not commit it.

## Manual Step 2 - Create Prisma Database Role

In the Supabase dashboard, open SQL Editor and run:

```text
supabase/sql/create_prisma_role.sql
```

Before running it, replace:

```text
CHANGE_ME_WITH_A_STRONG_PASSWORD
```

Use a generated password.

## Manual Step 3 - Get Connection String

In Supabase dashboard, click:

```text
Connect
```

Use the Supavisor session pooler string on port `5432` for this local/server backend.

It should look like:

```text
postgres://prisma.PROJECT_REF:PRISMA_PASSWORD@aws-REGION.pooler.supabase.com:5432/postgres
```

Set this in `.env`:

```bash
CASINO_BACKEND_DRIVER=prisma
DATABASE_URL="postgres://prisma.PROJECT_REF:PRISMA_PASSWORD@aws-REGION.pooler.supabase.com:5432/postgres"
```

## Apply Schema

After `.env` is set:

```bash
npm run db:deploy
npm run db:seed
npm run dev
```

## Verify

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"demo","password":"demo-password"}' | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).token")

curl http://localhost:3000/api/wallet/demo \
  -H "Authorization: Bearer $TOKEN"
```

Expected: the demo wallet should persist after server restarts.

## Security Notes

- Do not expose the Supabase service role key in the frontend.
- This project currently uses Prisma directly, not the Supabase Data API.
- RLS is enabled on generated public tables as defense in depth.
- No `anon` or `authenticated` table policies are created yet.
- Keep `SEED_PASSWORD`, `DATABASE_URL`, and `DIRECT_URL` out of git.
