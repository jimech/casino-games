# Architecture

## Runtime Shape

- `server.ts` is the Express entrypoint. It serves API routes and the Vite app.
- `src/App.tsx` is the main React application shell.
- `src/components/*Game.tsx` contains the playable game surfaces.
- `src/domain/*` contains deterministic math and wallet primitives.
- `src/backend/*Service.ts` contains backend service adapters.
- `src/backend/games/*Engine.ts` contains server-authoritative game engines.
- `prisma/schema.prisma` defines the persistent PostgreSQL data model.

## Backend Drivers

The backend can run in two modes:

- `CASINO_BACKEND_DRIVER=memory`: fast local/demo mode with in-process state.
- `CASINO_BACKEND_DRIVER=prisma`: persistent PostgreSQL mode through Prisma.

Both modes expose the same API surface for auth, wallet, games, bonuses, risk, notifications, AI event collection, and admin audit.

## Core Flows

### Auth And Session

1. User registers or logs in.
2. Password is stored as PBKDF2-SHA256 hash.
3. Server creates a bearer token session.
4. Protected APIs resolve the token to the current user.
5. Admin APIs require `role=admin`.

### Wallet And Round

1. Game start locks funds through wallet service.
2. Round state and hidden outcome data live server-side.
3. Actions update round state.
4. Settlement releases locked funds and credits payout when applicable.
5. Every wallet mutation writes a ledger entry.

### Game Authority

Roulette, Crash, Slots, Blackjack, and Poker use backend engines for outcome generation, wallet movement, and settlement. Frontend components render sanitized views and do not decide payouts.

### Risk, Bonuses, Notifications

- Risk service records failed logins, forbidden access, high stakes, rapid play, refunds, and high payouts.
- Bonus service records claims and credits wallet through the ledger.
- Notification service stores persistent inbox records with unread/read state.
- AI event service stores page, game, bonus, admin, wallet, risk, and session telemetry. Feature snapshots aggregate those events into deterministic `behavior-v1` user profiles. Recommendation, bonus-targeting, churn, and fraud services rank outputs from those snapshots with auditable reason/suppression/action codes and log each output back to AI events. Event capture, feature refresh, recommendations, bonus targeting, churn scoring, and fraud scoring never decide outcomes or wallet movements.

## Data Model

Primary tables:

- `users`
- `auth_sessions`
- `wallets`
- `wallet_ledger_entries`
- `game_rounds`
- `game_round_events`
- `risk_events`
- `bonus_campaigns`
- `bonus_claims`
- `notifications`
- `ai_events`
- `ai_feature_snapshots`
- `churn_scores`
- `fraud_scores`

## Quality Gate

`npm run quality` is the release gate. It runs Prisma schema validation, TypeScript, Vitest, production build, and memory-mode API smoke coverage.
