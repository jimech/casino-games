# Rollout Runbook

## Local Handoff

1. Install dependencies.

```bash
npm install
```

2. Generate Prisma client.

```bash
npm run db:generate
```

3. Run the quality gate.

```bash
npm run quality
```

4. Start local memory mode.

```bash
CASINO_BACKEND_DRIVER=memory npm run dev
```

## Persistent Database Rollout

1. Set `.env`.

```text
CASINO_BACKEND_DRIVER=prisma
DATABASE_URL=...
DIRECT_URL=...
SEED_USERNAME=demo
SEED_PASSWORD=...
ADMIN_INVITE_CODE=...
```

2. Apply migrations.

```bash
npm run db:deploy
```

3. Seed admin user and wallet.

```bash
npm run db:seed
```

4. Smoke test Prisma persistence. `npm run smoke:prisma` covers service-level wallet settlement and provably fair seed commit/reveal/list persistence. `npm run smoke:api:prisma` starts the bundled server in Prisma mode and checks auth, wallet, slots, proof verification, seed lifecycle, and admin evidence APIs.

```bash
npm run smoke:prisma
```

5. Run full quality gate.

```bash
npm run quality
```

## Release Checklist

- `npm run quality` passes.
- Migrations are committed.
- `.env` secrets are configured outside git.
- Admin seed login works.
- `/api/health` returns `online`.
- Admin Audit tab loads.
- Wallet, bonus, risk, and notification flows smoke test.

## Rollback Notes

- Code rollback: deploy the previous Git commit.
- Database rollback: Prisma migrations in this repo are forward-only. For failed rollout, restore from database backup or apply a deliberate corrective migration.
- Session rollback: revoking sessions requires updating `auth_sessions.revokedAt`.
- Bonus/risk/notification records are append-oriented and should not be deleted casually.

## Known Production Gaps

- No MFA yet.
- No cookie/CSRF session mode yet.
- No payment provider integration.
- No external email/SMS adapter.
- No formal admin role-management UI.
- No geolocation/KYC/AML provider integrations.
