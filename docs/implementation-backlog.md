# Casino Platform Implementation Backlog

Source: `Casino Platform Master Implementation Guide.pdf`

Current repo status: React/Vite prototype with playable Slots, Blackjack, Roulette, Poker, and Crash components, shared mock wallet state, lobby/profile/bonus/VIP/support/admin-style screens, and a small Express/Vite server. It is not yet a real platform architecture: there is no persistent database, auth, authoritative wallet ledger, settlement service, WebSocket layer, admin RBAC, or test suite.

Important product boundary: build the private project with real platform discipline: authoritative balances, immutable ledger entries, idempotent settlement, admin auditability, risk controls, and responsible-play controls. If this ever becomes public or commercial, licensing, geolocation, payments, KYC/AML, tax, and responsible-gambling obligations must be handled before launch.

## Recommendations

1. Treat the current app as the UX prototype, not the system of record.
2. Make wallet and ledger correctness the first production milestone.
3. Remove or soften public claims like "certified RNG" until backed by real certification.
4. Keep AI outside game outcomes, payout math, and wallet settlement.
5. Build deterministic game engines with stored round events before adding advanced UI polish.
6. Add compliance surfaces early, even for virtual currency: age gate, consent, limits, session timeout, self-exclusion style UI, and risk messaging.
7. Use tests as a gate for every wallet, ledger, settlement, refund, and idempotency change.

## Suggested Milestones

### Milestone 0 - Stabilize Current Prototype

Goal: make the existing app reliable enough to evolve.

- T00.1 - Dependency and script cleanup
- T00.2 - TypeScript compile gate
- T00.3 - Copy and compliance language cleanup
- T00.4 - Basic smoke tests for current screens
- T00.5 - Document current architecture and known gaps

### Milestone 1 - Platform Foundation

Goal: create the app foundation and authoritative data model.

- T01 - App shell and repo setup
- T02 - Database schema and migrations
- T03 - Authentication and user profile
- T04 - Single wallet service
- T05 - Bet locking and settlement flow
- T06 - Realtime wallet updates

### Milestone 2 - Game Engine Integration

Goal: move playable games onto shared round and wallet settlement flows.

- T07 - Lobby and shared UI system
- T08 - Slots game
- T09 - Blackjack game
- T10 - Roulette game
- T11 - Poker game
- T12 - Crash game

### Milestone 3 - Growth, Risk, and Operations

Goal: add personalization, bonuses, risk review, notifications, and admin visibility.

- T13 - AI recommendations
- T14 - Fraud and risk service
- T15 - Bonuses and VIP system
- T16 - Admin dashboard
- T17 - Notification and messaging system

### Milestone 4 - Hardening and Rollout

Goal: make the platform testable, monitorable, documented, and safer.

- T18 - Security hardening
- T19 - Testing and quality gates
- T20 - Documentation and rollout

### Milestone 5 - Advanced AI and Compliance Workflows

Goal: add AI event pipelines and audit-safe review flows.

- T21 - AI event collection
- T22 - AI feature store and user profile signals
- T23 - Game recommendation engine
- T24 - Personalized bonus targeting
- T25 - Churn and retention model
- T26 - Fraud and anomaly scoring
- T27 - Responsible play intervention engine
- T28 - AI explanation and audit logging
- T29 - AI model monitoring
- T30 - Security hardening and identity controls
- T31 - Compliance workflow and case review
- T32 - AI-safe UI integration

## Ticket Details

### T00.1 - Dependency and Script Cleanup

Summary: Ensure the current project installs, runs, builds, and type-checks cleanly.

Scope:
- Verify `npm install` produces required local binaries.
- Ensure `npm run dev`, `npm run build`, and `npm run lint` work.
- Rename misleading package metadata if needed.
- Add missing scripts only if they are immediately useful.

Acceptance criteria:
- Fresh install succeeds.
- Dev server starts from README instructions.
- Build completes.
- TypeScript check runs through `npm run lint`.

### T00.2 - TypeScript Compile Gate

Summary: Fix compile errors and make the existing prototype type-safe.

Scope:
- Run `tsc --noEmit`.
- Fix component, prop, and state typing issues.
- Avoid broad `any` escape hatches.

Acceptance criteria:
- TypeScript reports zero errors.
- Main game flows still render.

### T00.3 - Copy and Trust Language Cleanup

Summary: Align visible copy with a real private platform that does not make unsupported public claims.

Scope:
- Remove unsupported certification claims.
- Clarify which flows are private/local until production services exist.
- Add visible responsible-play, age-gate, and session-control language.
- Avoid public launch, licensing, or certification claims that the system cannot prove yet.

Acceptance criteria:
- UI does not claim external certification or public licensed operation.
- Users see age-gate and responsible-play framing before gameplay.
- Health endpoint does not claim false certification.

### T00.4 - Basic Smoke Tests for Current Screens

Summary: Add minimal automated confidence around the current prototype.

Scope:
- Add a test runner if absent.
- Cover app render, navigation, and one basic interaction per existing game where feasible.
- Keep tests fast and focused.

Acceptance criteria:
- Tests can run locally with one command.
- A broken main screen fails the suite.

### T00.5 - Current Architecture Notes

Summary: Document what exists today and what is still mock-only.

Scope:
- Describe frontend app structure.
- Describe mock wallet behavior.
- List missing backend/domain services.
- Link backlog milestones.

Acceptance criteria:
- A new developer can understand the current codebase in under 10 minutes.
- Known production gaps are explicit.

### T01 - App Shell and Repo Setup

Summary: Create the production-ready application structure.

Scope:
- Decide whether to keep single app or migrate to monorepo.
- Establish frontend, backend, shared types, config, linting, formatting, and env files.
- Document local commands.

Acceptance criteria:
- Frontend and backend start from documented commands.
- TypeScript compiles in configured packages.
- Environment examples exist.
- Lint and format commands are available.

### T02 - Database Schema and Migrations

Summary: Create the foundational schema for users, wallets, games, bonuses, risk, and audit.

Scope:
- Add PostgreSQL and Prisma.
- Create tables for users, wallets, wallet ledger entries, bet sessions, game rounds, game round events, providers, bonus campaigns, bonus claims, VIP tiers, risk events, audit events, admin users, feature flags, and notifications.
- Add primary keys, foreign keys, constraints, and indexes.
- Add seed data for games and VIP tiers.

Acceptance criteria:
- Fresh database migrates successfully.
- One wallet per user is enforced.
- Ledger idempotency key is unique.
- Core lookup indexes exist.

### T03 - Authentication and User Profile

Summary: Implement account access, protected routes, profile data, age gate, and consent.

Scope:
- Add registration, login, logout, and session handling.
- Add protected route behavior.
- Persist profile, age-gate state, and consent state.
- Add profile editing for allowed fields.

Acceptance criteria:
- A new user can create an account and log in.
- Unauthenticated users cannot access protected casino screens.
- Age gate and consent are required before gameplay.
- Session state survives refresh.

### T04 - Single Wallet Service

Summary: Implement the authoritative wallet service with immutable ledger writes.

Scope:
- Implement credit, debit, lock, release, settle, refund, apply bonus, and reverse transaction.
- Store balance before and after every mutation.
- Add idempotency protection and transaction boundaries.
- Prevent negative available balance.

Acceptance criteria:
- Each wallet mutation creates exactly one ledger entry.
- Duplicate idempotency keys do not double-charge or double-credit.
- Available and locked balances update correctly.
- Concurrent operations cannot overspend the wallet.

### T05 - Bet Locking and Settlement Flow

Summary: Implement the full bet lifecycle from bet placement to final settlement.

Scope:
- Place bet.
- Lock funds.
- Start round.
- Resolve win or loss.
- Refund failed or canceled rounds.
- Record settlement events.

Acceptance criteria:
- Bet placement atomically reduces available balance and increases locked balance.
- Win settlement releases locked funds and credits payout.
- Loss settlement releases locked funds without payout.
- Refund returns locked funds exactly once.

### T06 - Realtime Wallet Updates

Summary: Broadcast wallet and round changes to clients in real time.

Scope:
- Add WebSocket server.
- Emit wallet and game round events.
- Add reconnect and state resync behavior.
- Subscribe client to wallet and active round events.

Acceptance criteria:
- Balance changes appear without manual refresh.
- Reconnected clients receive current state.
- Round start and resolution events are delivered.

Implementation note:
- Current implementation streams authenticated wallet snapshots over `GET /api/wallet/:userId/events` with server-sent events. Game-screen-specific event feeds remain a later expansion.

### T07 - Lobby and Shared UI System

Summary: Formalize the casino lobby and reusable component system.

Scope:
- Create reusable navigation, game cards, wallet cards, tables, tabs, filters, modals, buttons, badges, forms, toasts, and empty states.
- Keep mobile-first layout.
- Reuse components across lobby, wallet, bonuses, VIP, support, and admin surfaces.

Acceptance criteria:
- Lobby works on mobile and desktop.
- Components are reused instead of duplicated.
- Game cards show title, category, provider, volatility, and action state.
- Navigation is accessible and consistent.

### T08 - Slots Game

Summary: Implement slots through the shared game engine and wallet settlement flow.

Scope:
- Define reel state, paylines, payout table, bonus rounds, and free spins.
- Persist round events.
- Resolve spins server-side or through a deterministic domain service.
- Settle through wallet service.

Acceptance criteria:
- A user can spin and receive a resolved outcome.
- Payouts follow the configured paytable.
- Free spins are tracked and settled correctly.
- Wallet changes come only from settlement.

### T09 - Blackjack Game

Summary: Implement blackjack through deterministic round events and wallet settlement.

Scope:
- Deck handling.
- Hit, stand, double, and split.
- Dealer logic.
- Hand scoring.
- Round snapshot and settlement.

Acceptance criteria:
- A complete round can be played end to end.
- Dealer behavior follows rules.
- Wins, losses, pushes, doubles, and splits settle correctly.
- Round state can be reconstructed from stored events.

### T10 - Roulette Game

Summary: Implement European roulette with supported betting options.

Scope:
- Number, color, odd/even, and high/low bets.
- Wheel spin resolution.
- Stored round result.
- Wallet settlement through shared flow.

Acceptance criteria:
- Supported bets resolve with correct payouts.
- Wheel result is stored.
- Wallet settlement is correct and idempotent.

### T11 - Poker Game

Summary: Implement Texas Hold'em style round flow.

Scope:
- Hole cards and community cards.
- Hand ranking.
- Pot tracking.
- Dealer or table simulation.
- Round snapshots and settlement events.

Acceptance criteria:
- A poker round progresses from deal to settlement.
- Hand strength is evaluated correctly.
- Pot and payout tracking are accurate.
- Round state can be reconstructed.

### T12 - Crash Game

Summary: Implement crash multiplier and cashout logic.

Scope:
- Multiplier growth.
- Manual cashout.
- Auto cashout.
- Crash state.
- Live round events.

Acceptance criteria:
- Multiplier increases until crash according to round logic.
- User can cash out before crash.
- Win and loss settlements are correct.
- Live state is visible to subscribed clients.

### T13 - AI Recommendations

Summary: Add AI-assisted personalization for lobby and promotions without touching game fairness.

Scope:
- Rank games by behavior signals.
- Reorder lobby sections.
- Suggest bonuses or content.
- Log outputs and reason codes.
- Provide fallback ranking.

Acceptance criteria:
- Lobby can show personalized game order.
- Recommendations update from stored behavior.
- AI cannot modify game outcomes or wallet math.
- Outputs are logged for review.

### T14 - Fraud and Risk Service

Summary: Detect suspicious behavior and create reviewable risk events.

Scope:
- Monitor deposit-like actions, play patterns, failed logins, device changes, bonus abuse, and session anomalies.
- Classify severity.
- Create risk queue records.

Acceptance criteria:
- Suspicious behavior creates a risk event.
- Risk events are visible to admins.
- Events include severity, timestamp, user, and context.

Implementation note:
- Current implementation persists risk events and exposes them through `GET /api/risk/events`. Rules cover failed logins, forbidden access attempts, high-stake rounds, rapid round activity, refunds, and high payouts.

### T15 - Bonuses and VIP System

Summary: Implement bonus campaigns, claims, loyalty tiers, and rewards.

Scope:
- Welcome bonus.
- Free spins.
- Cashback rules.
- VIP tier progression.
- Bonus history and ledger linkage.

Acceptance criteria:
- Eligible bonus can be claimed only according to rule.
- Bonus usage is tracked.
- VIP progression updates from activity.
- Bonus and VIP views are visible.

Implementation note:
- Current implementation persists welcome and daily bonus campaigns, records welcome claims once and daily claims once per day, and credits the wallet through the ledger. Cashback rules and VIP progression remain later expansions.

### T16 - Admin Dashboard

Summary: Build internal tooling for users, transactions, rounds, risk, and audit.

Scope:
- User search.
- Ledger search.
- Round replay.
- Risk review.
- Feature flags.
- Audit timeline.

Acceptance criteria:
- Admin can search users and inspect wallet history.
- Admin can inspect risk, round, ledger, and bonus activity.

Implementation note:
- Current implementation adds `GET /api/admin/summary` and an Admin Audit tab for the authenticated account. Multi-user search, admin roles, round replay, and review workflows remain later expansions.
- Ledger and round history are searchable.
- Risk events are reviewable.
- Admin actions create audit logs.

### T17 - Notification and Messaging System

Summary: Add notification infrastructure for user and admin events.

Scope:
- In-app notifications.
- Mock email provider or adapter.
- Preferences.
- Admin-triggered notices.

Acceptance criteria:
- Users receive bonus and settlement notifications.
- Preferences are respected.
- Admin notices are logged.

Implementation note:
- Current implementation persists in-app notifications, supports unread/read state, creates bonus and support notifications, and exposes an authenticated Notification Inbox. Preferences and external email adapters remain later expansions.

### T18 - Security Hardening

Summary: Add platform-level security controls.

Scope:
- MFA for sensitive actions.
- RBAC.
- Rate limiting.
- Secure sessions and cookies.
- CSRF protection where needed.
- Secrets management.

Acceptance criteria:
- Protected endpoints reject unauthorized access.
- Privileged or financial actions require stronger auth.
- Rate limits block abusive patterns.
- Security events are logged.

Implementation note:
- Current implementation adds persisted user roles, admin invite-code registration, admin-only access for audit/risk endpoints, auth rate limiting, and risk events for forbidden admin access and rate-limit abuse. MFA, CSRF tokens, and cookie-based sessions remain later expansions.

### T19 - Testing and Quality Gates

Summary: Add automated coverage for wallet, games, API, realtime, AI, risk, and admin flows.

Scope:
- Unit tests.
- Integration tests.
- UI smoke tests.
- Settlement and rollback tests.
- CI gate.

Acceptance criteria:
- Wallet math tests pass.
- Game settlement tests cover win, loss, and refund paths.
- WebSocket and API tests pass.
- Critical wallet tests block merge or release.

Implementation note:
- Current implementation adds `npm run quality`, a memory-mode API smoke script, and `.github/workflows/quality.yml`. The gate validates Prisma schema, runs TypeScript, all Vitest suites, production build, and API smoke coverage for auth, RBAC, bonus, risk, notifications, and wallet events.

### T20 - Documentation and Rollout

Summary: Prepare the system for handoff and repeatable rollout.

Scope:
- README.
- Architecture doc.
- Environment setup.
- Ticket index.
- Release notes.
- Rollback notes.

Acceptance criteria:
- A new developer can run the app from README alone.
- Architecture and data model are documented.
- Ticket status and dependencies are clear.

Implementation note:
- Current implementation adds architecture, rollout, and release-note docs, and links them from the README. The rollout path covers memory mode, persistent Prisma mode, quality gate, migrations, seed, smoke tests, rollback notes, and known production gaps.

### T21 - AI Event Collection

Summary: Collect behavior signals for personalization and risk analysis.

Implementation status: Complete. The platform now stores structured AI event telemetry in memory and Prisma drivers, exposes filtered event APIs, captures page/game/bonus/admin signals, and shows recent events in the admin audit screen. Capture is best-effort and cannot block game or wallet flows.

Scope:
- Track page views, game clicks, bet frequency, session duration, bonus usage, and churn indicators.
- Store structured events.
- Add opt-in or opt-out handling where appropriate.

Acceptance criteria:
- Events include timestamp, user, category, and context.
- Event capture does not block user flow.
- Events can be filtered by user, category, and time.

### T22 - AI Feature Store and User Profile Signals

Summary: Convert raw events into deterministic AI feature snapshots.

Implementation status: Complete. Raw AI events now refresh versioned `behavior-v1` feature snapshots with deterministic totals, category counts, game preference, stake profile, bonus usage, engagement, and high-stake signals.

Scope:
- Aggregate session stats, game preferences, bet patterns, and risk signals.
- Store versioned per-user feature snapshots.
- Refresh from recent events.

Acceptance criteria:
- Each user has an up-to-date feature profile.
- Feature generation is deterministic and versioned.
- Recommendations and risk models can use snapshots.

### T23 - Game Recommendation Engine

Summary: Rank games and lobby ordering based on behavior.

Implementation status: Complete. The lobby now fetches deterministic game recommendations, ranks catalog cards from feature snapshots, falls back to RTP/volatility ordering, and logs recommendation outputs with scores and reasons.

Scope:
- Rank by category preference, volatility preference, recency, and engagement.
- Provide fallback non-AI ranking.
- Log recommendation outputs.

Acceptance criteria:
- Lobby displays personalized order.
- Recommendations update from recent behavior.
- Fallback ranking works when AI is unavailable.
- Outputs are auditable.

### T24 - Personalized Bonus Targeting

Summary: Show targeted promotions based on eligibility and behavior.

Implementation status: Complete. The platform now returns deterministic targeted bonus offers with welcome, retention, and reactivation segments, cooldown/claim suppression, reason codes, and AI-event decision logging.

Scope:
- Define welcome, retention, and reactivation offers.
- Add cooldown and suppression rules.
- Log targeting decisions.

Acceptance criteria:
- Offers target specific segments.
- Duplicate active offers are prevented unless allowed.
- Decisions include reason codes.

### T25 - Churn and Retention Model

Summary: Score churn risk and surface retention actions.

Implementation status: Complete. Churn scoring now produces persisted `churn-v1` scores with low/medium/high/critical bands, reason codes, retention actions, AI-event audit logs, and risk-queue surfacing for high-risk users.

Scope:
- Score inactivity, low engagement, and session drop-off.
- Trigger retention prompts or outreach candidates.
- Store model history.

Acceptance criteria:
- Users can receive churn risk scores.
- High-risk users surface for review.
- Scores are explainable enough for admin review.
- Churn scoring does not affect wallet or game outcomes.

### T26 - Fraud and Anomaly Scoring

Summary: Score suspicious payment-like, device, geo, and gameplay patterns.

Implementation status: Complete. Fraud scoring now produces persisted `fraud-v1` scores with low/medium/high/critical bands, reason codes, recommended review actions, AI-event audit logs, and risk-queue surfacing for high/critical users.

Scope:
- Detect velocity anomalies, device changes, geo mismatches, bonus abuse, account takeover signals, and collusion indicators.
- Create risk queue events.

Acceptance criteria:
- Suspicious patterns create risk flags.
- High-severity signals can block or require review.
- Fraud events are visible in admin.

### T27 - Responsible Play Intervention Engine

Summary: Trigger safer-play interventions from behavioral thresholds.

Implementation status: Complete. Responsible-play interventions now produce persisted `responsible-play-v1` decisions with none/notice/warning/cooldown levels, reason codes, acknowledgement requirements, player-facing warning responses, AI-event audit logs, and admin-reviewable risk events.

Scope:
- Detect long sessions, rapid bet escalation, chase behavior, and self-limit conflicts.
- Show warnings or friction.
- Log intervention decisions.

Acceptance criteria:
- Thresholds trigger interventions.
- Warnings appear before continued play when needed.
- Interventions are logged and admin-reviewable.

### T28 - AI Explanation and Audit Logging

Summary: Make AI decisions explainable and searchable.

Implementation status: Complete. AI decision explanations now persist model version, source snapshot, input features, output, thresholds, and reason codes for recommendations, bonus targeting, churn, fraud, and responsible-play decisions, with admin review and CSV export endpoints.

Scope:
- Log model version, input features, output score, threshold, and reason code.
- Save decision traces for recommendations and risk events.
- Add export support for audits.

Acceptance criteria:
- Every AI recommendation has an explanation record.
- Every risk decision stores model and threshold data.
- Admins can review decisions after the fact.

### T29 - AI Model Monitoring

Summary: Monitor model health, drift, failures, and alert fatigue.

Scope:
- Track accuracy, false positives, false negatives, drift, stale models, and degraded service behavior.
- Add model disable/fallback controls.

Acceptance criteria:
- Model health metrics are visible.
- Degradation creates an operational alert.
- Models can be disabled with rule-based fallback.

### T30 - Security Hardening and Identity Controls

Summary: Extend identity and API protections across the platform.

Scope:
- JWT or session hardening.
- MFA.
- RBAC.
- API signing where needed.
- Replay protection.
- Admin privilege separation.

Acceptance criteria:
- Sensitive actions require stronger auth.
- API requests are protected against abuse and replay.
- Admin access is role-limited.
- Security events are searchable.

### T31 - Compliance Workflow and Case Review

Summary: Build review workflows for compliance, fraud, and responsible-play cases.

Scope:
- Case queues.
- Assignment.
- Review notes.
- Status changes.
- Evidence links.
- Audit trail integration.

Acceptance criteria:
- Cases can be created, assigned, and closed.
- Notes and outcomes are stored permanently.
- Evidence is inspectable.
- Case actions appear in audit logs.

### T32 - AI-Safe UI Integration

Summary: Connect AI outputs to the UI with safe fallback behavior.

Scope:
- Render recommendations.
- Render bonus banners.
- Render risk and responsible-play notices.
- Show fallback content when AI fails.

Acceptance criteria:
- AI recommendations do not break layout.
- Risk banners display only when triggered.
- Fallback UI appears when AI services fail.
- AI UI changes never block wallet or game operations.

## First Working Sequence

Start here:

1. T00.1 - Dependency and script cleanup
2. T00.2 - TypeScript compile gate
3. T00.3 - Copy and compliance language cleanup
4. T00.5 - Current architecture notes
5. T01 - App shell and repo setup

Reason: the current app already has useful UX and game prototypes, but production work should start by making the prototype runnable, truthful, documented, and testable before introducing a database or wallet ledger.
