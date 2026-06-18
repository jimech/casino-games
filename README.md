# Casino Games

Private casino platform project built with React, TypeScript, Vite, Express, Prisma, and PostgreSQL.

The current codebase is a playable prototype with a shared in-memory wallet and multiple game screens. The production roadmap is tracked in [docs/implementation-backlog.md](docs/implementation-backlog.md).

## Prerequisites

- Node.js 20 or newer
- npm

## Setup

```bash
npm install
```

## Local Development

```bash
npm run dev
```

The app server listens on:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/api/health
```

## Database Setup

The project is configured for PostgreSQL through Prisma.

Manual requirements for persistent mode:

```text
DATABASE_URL
DIRECT_URL
```

Backend storage driver:

```text
CASINO_BACKEND_DRIVER=prisma
```

Use `memory` while developing without a database. Use `prisma` after `DATABASE_URL` is configured and migrations are applied.

You can use local Postgres, Neon, Supabase, Railway, Render, or any managed PostgreSQL provider. This project is currently set up against Neon.

Supabase setup guide:

[docs/supabase/setup.md](docs/supabase/setup.md)

Generate Prisma client:

```bash
npm run db:generate
```

Apply migrations after `DATABASE_URL` is configured:

```bash
npm run db:migrate
```

Deploy committed migrations to a remote database:

```bash
npm run db:deploy
```

Seed the demo user and wallet:

```bash
npm run db:seed
```

Smoke test the Prisma-backed wallet and settlement flow:

```bash
npm run smoke:prisma
```

## Verification

```bash
npm run lint
npm run test:math
npm run test:backend
npm run build
npm audit --audit-level=high
```

## Backend API

The backend can run in memory or Prisma mode. With `CASINO_BACKEND_DRIVER=prisma`, wallet reads, bet locks, round settlement, refunds, and ledger entries are stored in PostgreSQL. The default seeded user is:

```text
demo
```

Read wallet:

```bash
curl http://localhost:3000/api/wallet/demo
```

Place a bet and lock funds:

```bash
curl -X POST http://localhost:3000/api/bets \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","gameId":"roulette","stake":100,"idempotencyKey":"bet-demo-1"}'
```

Settle a round:

```bash
curl -X POST http://localhost:3000/api/rounds/ROUND_ID/settle \
  -H "Content-Type: application/json" \
  -d '{"payout":3600,"idempotencyKey":"settle-demo-1","outcome":{"number":17}}'
```

Refund a round:

```bash
curl -X POST http://localhost:3000/api/rounds/ROUND_ID/refund \
  -H "Content-Type: application/json" \
  -d '{"idempotencyKey":"refund-demo-1","reason":"round failed"}'
```

Server-authoritative roulette spin:

```bash
curl -X POST http://localhost:3000/api/games/roulette/spin \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","bets":{"outside":{"red":10},"straight":{"17":5}},"idempotencyKey":"roulette-demo-1"}'
```

Server-authoritative crash launch:

```bash
curl -X POST http://localhost:3000/api/games/crash/start \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","stake":20,"idempotencyKey":"crash-demo-1"}'
```

Server-authoritative crash cashout:

```bash
curl -X POST http://localhost:3000/api/games/crash/ROUND_ID/cashout \
  -H "Content-Type: application/json" \
  -d '{"cashoutMultiplier":1.5,"idempotencyKey":"crash-demo-1-cashout"}'
```

Server-authoritative slots spin:

```bash
curl -X POST http://localhost:3000/api/games/slots/spin \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","machineId":"fruit-mania","bet":5,"freeSpin":false,"bonusMultiplier":1,"idempotencyKey":"slots-demo-1"}'
```

## Current Status

- React/Vite frontend prototype
- Express server wrapper
- Playable Slots, Blackjack, Roulette, Poker, and Crash game components
- In-memory backend wallet and settlement service
- Prisma/PostgreSQL backend service wired to Neon
- Frontend game wallet actions mirrored to backend bet and settlement APIs
- Roulette has a server-authoritative spin endpoint using backend RNG and payout resolution
- Crash has server-authoritative launch and cashout endpoints using stored crash points and server elapsed time
- Slots has server-authoritative reel strips, stop selection, paytable resolution, and wallet settlement
- No real auth yet
- Domain math tests and backend settlement tests exist

Start with `T00.1` in the backlog, then continue ticket by ticket.
