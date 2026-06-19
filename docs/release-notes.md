# Release Notes

## Current Internal Checkpoint

This checkpoint turns the original playable casino prototype into a backend-authoritative private platform foundation.

Completed:

- PostgreSQL/Prisma persistence path.
- Auth sessions with roles and admin invite codes.
- Server-authoritative Roulette, Crash, Slots, Blackjack, and Poker.
- Wallet ledger, bet locking, settlement, refunds, and idempotency.
- Realtime wallet stream with server-sent events.
- Risk event service.
- Bonus campaign and claim service.
- Admin audit summary.
- Notification inbox.
- Quality gate and GitHub Actions workflow.

Verification:

```bash
npm run quality
```

Manual database rollout:

```bash
npm run db:deploy
npm run db:seed
```

Primary follow-up areas:

- MFA and stronger session controls.
- Admin role management and multi-user search.
- Payment/KYC/provider integrations.
- More UI smoke coverage.
- Model-driven personalization and risk scoring.
