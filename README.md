# Casino Games

Private casino platform project built with React, TypeScript, Vite, Express, Prisma, and PostgreSQL.

The current codebase is a playable private platform prototype with server-authoritative game engines, wallet ledger, auth, risk, bonuses, notifications, AI event collection, admin audit, and a quality gate. The production roadmap is tracked in [docs/implementation-backlog.md](docs/implementation-backlog.md).

Project docs:

- [Architecture](docs/architecture.md)
- [Rollout runbook](docs/rollout.md)
- [Release notes](docs/release-notes.md)
- [Implementation backlog](docs/implementation-backlog.md)
- [Supabase setup](docs/supabase/setup.md)

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

Seed the demo user and wallet. The default local seed login is `demo` / `demo-password`; override it with `SEED_USERNAME` and `SEED_PASSWORD` in `.env`.

```bash
npm run db:seed
```

The seeded user is an admin. New registrations receive the `user` role unless they submit the configured `ADMIN_INVITE_CODE`.

Smoke test the Prisma-backed wallet and settlement flow:

```bash
npm run smoke:prisma
```

## Verification

```bash
npm run quality
```

The quality gate runs Prisma schema validation, TypeScript, all tests, production build, and the memory-mode API smoke test. `npm run smoke:api` expects `dist/server.js`, so run `npm run build` first when using it directly. Individual checks are also available:

```bash
npm run lint
npm run test:math
npm run test:backend
npm run build
npm run smoke:api
npm audit --audit-level=high
```

## Backend API

The backend can run in memory or Prisma mode. With `CASINO_BACKEND_DRIVER=prisma`, users, auth sessions, wallet reads, bet locks, round settlement, refunds, and ledger entries are stored in PostgreSQL. The default seeded user is:

```text
demo
```

Register a private account:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"private_player","password":"very-secret-pass","acceptAgeGate":true,"acceptTerms":true,"acceptPrivacy":true}'
```

Log in and save the session token for protected API calls:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"demo","password":"demo-password"}' | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).token")
```

Read wallet:

```bash
curl http://localhost:3000/api/wallet/demo \
  -H "Authorization: Bearer $TOKEN"
```

Subscribe to realtime wallet updates:

```bash
curl -N "http://localhost:3000/api/wallet/demo/events?token=$TOKEN"
```

Record an AI behavior event for future personalization/risk features:

```bash
curl -X POST http://localhost:3000/api/ai/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"category":"page","name":"tab_viewed","context":{"tab":"games"}}'
```

Read recent AI events. Admin sessions can filter by `userId`; regular sessions only see their own events:

```bash
curl "http://localhost:3000/api/ai/events?category=game&limit=25" \
  -H "Authorization: Bearer $TOKEN"
```

Refresh the deterministic AI feature profile from recent events:

```bash
curl -X POST http://localhost:3000/api/ai/profile/refresh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"limit":250}'
```

Read the latest feature snapshot:

```bash
curl http://localhost:3000/api/ai/profile \
  -H "Authorization: Bearer $TOKEN"
```

Read ranked game recommendations:

```bash
curl "http://localhost:3000/api/recommendations/games?limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

Read targeted bonus offers:

```bash
curl http://localhost:3000/api/bonuses/targeted \
  -H "Authorization: Bearer $TOKEN"
```

Read VIP status:

```bash
curl http://localhost:3000/api/vip/status \
  -H "Authorization: Bearer $TOKEN"
```

Claim available weekly VIP cashback:

```bash
curl -X POST http://localhost:3000/api/vip/cashback/claim \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"idempotencyKey":"vip-cashback-demo-1"}'
```

List tournaments and leaderboards:

```bash
curl http://localhost:3000/api/tournaments \
  -H "Authorization: Bearer $TOKEN"

curl http://localhost:3000/api/tournaments/weekly-neon-race/leaderboard \
  -H "Authorization: Bearer $TOKEN"
```

Enter an active tournament:

```bash
curl -X POST http://localhost:3000/api/tournaments/weekly-neon-race/enter \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"idempotencyKey":"tournament-entry-demo-1"}'
```

Review or settle tournament prizes as an admin:

```bash
curl http://localhost:3000/api/admin/tournaments/weekly-neon-race/settlement \
  -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/admin/tournaments/weekly-neon-race/settle \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"idempotencyKey":"tournament-settle-demo-1"}'
```

Refresh churn and retention scoring:

```bash
curl -X POST http://localhost:3000/api/retention/churn-score/refresh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

Refresh fraud and anomaly scoring:

```bash
curl -X POST http://localhost:3000/api/risk/fraud-score/refresh \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

Evaluate responsible play intervention:

```bash
curl -X POST http://localhost:3000/api/responsible-play/interventions/evaluate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"gameId":"roulette","stake":5000}'
```

Review AI decision explanations:

```bash
curl "http://localhost:3000/api/admin/ai-decision-explanations?limit=25" \
  -H "Authorization: Bearer $TOKEN"
```

Export AI decision explanations:

```bash
curl "http://localhost:3000/api/admin/ai-decision-explanations/export?limit=500" \
  -H "Authorization: Bearer $TOKEN" \
  -o ai-decision-explanations.csv
```

Review AI model health:

```bash
curl http://localhost:3000/api/admin/ai-model-health \
  -H "Authorization: Bearer $TOKEN"
```

Create a step-up token for sensitive admin actions:

```bash
STEP_UP_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/step-up \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"password":"your-password","scope":"admin:sensitive"}' | jq -r .stepUpToken)
```

Disable a model-assisted decision path into fallback mode:

```bash
curl -X POST http://localhost:3000/api/admin/ai-model-controls/fraud_score \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Step-Up-Token: $STEP_UP_TOKEN" \
  -H "X-Request-Id: model-control-$(uuidgen)" \
  -d '{"disabled":true,"reason":"manual review"}'
```

Create a compliance review case:

```bash
curl -X POST http://localhost:3000/api/admin/compliance/cases \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"subjectUserId":"USER_ID","type":"fraud","priority":"high","title":"Fraud anomaly review","evidence":{"fraudScoreId":"FRAUD_SCORE_ID"}}'
```

Add a review note or close a case:

```bash
curl -X POST http://localhost:3000/api/admin/compliance/cases/CASE_ID/notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"note":"Reviewed evidence.","action":"closed","status":"closed","outcome":"no_action_needed"}'
```

Place a bet and lock funds:

```bash
curl -X POST http://localhost:3000/api/bets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"gameId":"roulette","stake":100,"idempotencyKey":"bet-demo-1"}'
```

Settle a round:

```bash
curl -X POST http://localhost:3000/api/rounds/ROUND_ID/settle \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"payout":3600,"idempotencyKey":"settle-demo-1","outcome":{"number":17}}'
```

Refund a round:

```bash
curl -X POST http://localhost:3000/api/rounds/ROUND_ID/refund \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"idempotencyKey":"refund-demo-1","reason":"round failed"}'
```

Server-authoritative roulette spin:

```bash
curl -X POST http://localhost:3000/api/games/roulette/spin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"bets":{"outside":{"red":10},"straight":{"17":5}},"idempotencyKey":"roulette-demo-1"}'
```

Server-authoritative crash launch:

```bash
curl -X POST http://localhost:3000/api/games/crash/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"stake":20,"idempotencyKey":"crash-demo-1"}'
```

Server-authoritative crash cashout:

```bash
curl -X POST http://localhost:3000/api/games/crash/ROUND_ID/cashout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cashoutMultiplier":1.5,"idempotencyKey":"crash-demo-1-cashout"}'
```

Server-authoritative slots spin:

```bash
curl -X POST http://localhost:3000/api/games/slots/spin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"machineId":"fruit-mania","bet":5,"freeSpin":false,"bonusMultiplier":1,"idempotencyKey":"slots-demo-1"}'
```

Server-authoritative blackjack deal:

```bash
curl -X POST http://localhost:3000/api/games/blackjack/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"stake":25,"idempotencyKey":"blackjack-demo-1"}'
```

Server-authoritative blackjack action:

```bash
curl -X POST http://localhost:3000/api/games/blackjack/ROUND_ID/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"stand","idempotencyKey":"blackjack-demo-1-stand"}'
```

Supported blackjack actions:

```text
hit
stand
double
split
```

Server-authoritative poker deal:

```bash
curl -X POST http://localhost:3000/api/games/poker/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ante":25,"idempotencyKey":"poker-demo-1"}'
```

Server-authoritative poker action:

```bash
curl -X POST http://localhost:3000/api/games/poker/ROUND_ID/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"action":"raise","idempotencyKey":"poker-demo-1-raise"}'
```

Supported poker actions:

```text
check
call
raise
fold
```

List risk events:

```bash
curl "http://localhost:3000/api/risk/events?status=open&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

Claim a bonus:

```bash
curl -X POST http://localhost:3000/api/bonuses/welcome-match-500/claim \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"idempotencyKey":"bonus-demo-welcome"}'
```

Read admin audit summary:

```bash
curl http://localhost:3000/api/admin/summary \
  -H "Authorization: Bearer $TOKEN"
```

Search users as an admin:

```bash
curl "http://localhost:3000/api/admin/users?query=quality&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

Read an account review packet as an admin:

```bash
curl http://localhost:3000/api/admin/users/USER_ID \
  -H "Authorization: Bearer $TOKEN"
```

Read a round evidence packet as an admin:

```bash
curl http://localhost:3000/api/admin/rounds/ROUND_ID \
  -H "Authorization: Bearer $TOKEN"
```

Export round evidence as JSON:

```bash
curl http://localhost:3000/api/admin/rounds/ROUND_ID/evidence-export \
  -H "Authorization: Bearer $TOKEN" \
  -o round-evidence.json
```

Read notification inbox:

```bash
curl http://localhost:3000/api/notifications \
  -H "Authorization: Bearer $TOKEN"
```

Read notification preferences:

```bash
curl http://localhost:3000/api/notifications/preferences \
  -H "Authorization: Bearer $TOKEN"
```

Mute an optional notification category:

```bash
curl -X POST http://localhost:3000/api/notifications/preferences/support \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"enabled":false}'
```

Review notification delivery decisions as an admin:

```bash
curl "http://localhost:3000/api/admin/notifications/deliveries?limit=25" \
  -H "Authorization: Bearer $TOKEN"
```

## Current Status

- React/Vite frontend prototype
- Express server wrapper
- Playable Slots, Blackjack, Roulette, Poker, and Crash game components
- In-memory backend wallet and settlement service
- Prisma/PostgreSQL backend service wired to Neon
- Private account registration, login, logout, token sessions, age gate, and consent gate
- Role-based admin access, admin invite codes, auth rate limiting, and security risk events
- Realtime wallet updates stream through an authenticated server-sent events endpoint
- Risk service records failed logins, forbidden access attempts, high-stake rounds, rapid round activity, refunds, and high payouts
- Bonus service supports persisted welcome, daily credit, and VIP cashback claims with ledger-linked wallet credits
- VIP service computes tier progression from settled stake and weekly cashback from settled net losses
- Tournament service supports active entry, persisted leaderboards, admin settlement, and ledger-linked prize payouts
- Admin audit panel summarizes wallet, ledger, rounds, risk events, and bonus claims
- Notification inbox persists bonus, support, admin, and system notices with unread/read state, category preferences, and admin-visible delivery decisions
- Quality gate and GitHub Actions workflow cover schema validation, TypeScript, tests, build, and memory API smoke
- Frontend game wallet actions mirrored to backend bet and settlement APIs
- Roulette has a server-authoritative spin endpoint using backend RNG and payout resolution
- Crash has server-authoritative launch and cashout endpoints using stored crash points and server elapsed time
- Slots has server-authoritative reel strips, stop selection, paytable resolution, and wallet settlement
- Blackjack has server-authoritative deal, hit, stand, double down, split hands, dealer draw, hole-card protection, and settlement
- Poker has server-authoritative deck control, staged board dealing, fold/check/call/raise actions, showdown evaluation, pot settlement, and hidden dealer cards
- Domain math tests and backend settlement tests exist
