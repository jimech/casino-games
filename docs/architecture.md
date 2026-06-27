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
- VIP service derives tier from settled stake, computes weekly cashback from settled net losses, prevents duplicate weekly cashback claims through bonus claim keys, and credits cashback through the same wallet ledger.
- Tournament service defines active/upcoming events, stores entries and settlement records in memory or Prisma, debits entry fees through wallet ledger entries, prevents duplicate user entry, and computes leaderboards from settled post-entry round records only. Tournament settlement requires ended status, distributes prize pools across ranked winners, and credits prize payouts through idempotent wallet ledger entries.
- Notification service stores persistent inbox records with unread/read state, user preferences by category, and delivery audit rows for delivered or preference-suppressed attempts. System, risk, and admin notices are mandatory and cannot be disabled.
- Security controls use short-lived password-backed step-up tokens for sensitive admin actions and `X-Request-Id` replay checks on protected mutations. Step-up failures, missing request ids, and replay attempts are stored as searchable risk events.
- Compliance case service stores permanent case queues, assignments, review notes, outcomes, and structured evidence links. Case actions are mirrored into admin AI events and risk events for auditability.
- Admin account review supports public-field user search and role-protected evidence packets with wallet, ledger, round, risk, compliance, notification, and AI records. Searches and detail views are captured as admin AI events.
- Admin round review assembles read-only evidence packets from the immutable ledger, round record, risk events, AI telemetry, AI explanations, and compliance case evidence. JSON exports are timestamped and replay timelines are descriptive only; they never call settlement, refund, or wallet mutation paths.
- Admin tournament evidence assembles read-only settlement packets from tournament definitions, final leaderboards, participant ledger entries, scored rounds, settlement payouts, risk/compliance links, and admin AI audit events. Versioned JSON exports prove entry-fee debits and prize-payout credits without calling settlement or wallet mutation paths.
- Tournament cancellation stores durable cancellation/refund records and credits paid entry fees through the wallet ledger with `tournament_entry_refund` metadata. Cancellation is idempotent, blocks later settlement, refuses already-settled tournaments, sends wallet notifications, and is included in evidence exports with refund-ledger integrity counts.
- Tournament disputes reuse compliance cases: admins open disputes from tournament evidence, the case evidence stores tournament/settlement/cancellation ids plus ledger integrity counts, and evidence exports include linked dispute cases for review without duplicating case storage.
- Admin tournament queues are computed read models over tournament definitions, leaderboards, settlements, cancellations, and compliance disputes. Filters expose active, ended, cancelled, settled, disputed, unresolved, and needs-settlement states without creating a separate queue table.
- Tournament settlement jobs run as explicit admin-triggered scans over the queue. Dry-run mode alerts admins and records telemetry only; optional auto-settle mode uses the existing idempotent settlement service and notification path for tournaments already flagged as needs-settlement.
- Tournament settlement policy is evaluated before automated payouts. Policy checks include enablement, prize-pool ceiling, minimum entries, minimum scored entries, dispute-free state, and cancellation state; queue rows and job reports expose allow/block decisions and reason codes.
- Game math simulations are pure read-only reports over domain game logic. Roulette and slot scenarios use exact outcome enumeration; crash, blackjack, and poker use deterministic seeded sampling with explicit strategy/rake assumptions. Reports surface RTP, hit rate, volatility, house edge, and warning codes without creating rounds or wallet ledger entries.
- Provably fair verification uses HMAC-SHA256 server seed commitments for default roulette, slots, and crash outcomes. Settled outcome metadata includes the server seed hash, revealed seed, client seed, nonce, cursor, and derived result; `/api/provably-fair/verify` replays those values without touching wallet or ledger state.
- Provably fair seed lifecycle records are committed before outcome generation in memory and Prisma modes. Roulette and slots reveal immediately after settlement; crash stores a commitment at round start and reveals the server seed only when the round settles. Prisma mode persists lifecycle records in `provably_fair_seeds` with idempotent commitment keys and per-user/game nonce uniqueness.
- Round evidence replays stored provably fair proofs as a read-only verification step. Evidence packets and exports expose proof presence, validity, expected result, error codes, integrity counts, and a replay timeline event without changing round or wallet records.
- Player proof inspection reuses the same verifier through owned-round endpoints. The Wallet tab shows recent player rounds and proof status without exposing admin evidence or other users' round data.
- AI event service stores page, game, bonus, admin, wallet, risk, and session telemetry. Feature snapshots aggregate those events into deterministic `behavior-v1` user profiles. Recommendation, bonus-targeting, churn, fraud, and responsible-play services rank outputs from those snapshots with auditable reason/suppression/action codes and log each output back to AI events. AI decision explanations persist model version, input features, output, thresholds, and reason codes for admin review and CSV export. AI model monitoring computes fallback/stale-input health from explanations, supports admin disable controls, and creates operational risk alerts when degraded. Event capture, feature refresh, recommendations, bonus targeting, churn scoring, fraud scoring, responsible-play intervention logging, explanation logging, and model monitoring never decide outcomes or wallet movements.
- AI UI integration treats model-assisted responses as untrusted display data: lobby rankings, targeted offers, responsible-play messages, and admin panels sanitize arrays, dates, strings, and scores before rendering fallback states.

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
- `compliance_cases`
- `compliance_case_notes`
- `ai_events`
- `ai_model_controls`
- `ai_decision_explanations`
- `ai_feature_snapshots`
- `churn_scores`
- `fraud_scores`
- `responsible_play_interventions`

## Quality Gate

`npm run quality` is the release gate. It runs Prisma schema validation, TypeScript, Vitest, production build, and memory-mode API smoke coverage.
