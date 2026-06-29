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

Implementation status: Complete. AI model monitoring now reports per-decision-path fallback and stale-input health, supports admin disable controls with fallback-version explanation records, surfaces metrics in Admin Audit, and creates operational risk/notification alerts when degraded.

Scope:
- Track accuracy, false positives, false negatives, drift, stale models, and degraded service behavior.
- Add model disable/fallback controls.

Acceptance criteria:
- Model health metrics are visible.
- Degradation creates an operational alert.
- Models can be disabled with rule-based fallback.

### T30 - Security Hardening and Identity Controls

Summary: Extend identity and API protections across the platform.

Implementation status: Complete. Sensitive admin mutations now require password-backed step-up authentication plus `X-Request-Id` replay protection, with failures recorded as searchable risk events and client helpers for step-up/control flows.

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

Implementation status: Complete. Compliance cases now support queue creation, assignment, status changes, permanent review notes, structured evidence links, admin UI visibility, and audit/risk-event trails for case actions.

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

Implementation status: Complete. AI-driven lobby rankings, targeted offers, responsible-play messages, and admin AI panels now sanitize incoming data, render fallback notices, and keep standard catalog/promotions/admin surfaces usable when AI responses fail or arrive incomplete.

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

### T33 - Admin User Search and Account Review

Summary: Let admins find accounts and inspect account-level wallet, risk, compliance, notification, and AI evidence.

Implementation status: Complete. Admins now have role-protected `/api/admin/users` search and `/api/admin/users/:userId` account-review endpoints, public-only account results, detailed wallet/ledger/round/risk/compliance/AI evidence packets, auditable admin AI events for searches and detail views, UI account review panels, and smoke coverage for forbidden regular-user access.

Scope:
- Search account records by username, email, display name, id, and role.
- Load a selected account review packet.
- Include wallet, ledger, rounds, risk events, bonus claims, notifications, AI events, AI explanations, compliance cases, and latest model scores.
- Audit admin searches and account detail views.

Acceptance criteria:
- Regular users cannot search or review other accounts.
- Admin search returns public account fields only.
- Admin detail includes account evidence without exposing password or session secrets.
- Admin review actions are visible in audit telemetry.

### T34 - Admin Round Replay and Evidence Pack

Summary: Add a deeper round-review view for disputed or risky game rounds.

Implementation status: Complete. Admins can now open `/api/admin/rounds/:roundId` for a read-only round evidence packet and `/api/admin/rounds/:roundId/evidence-export` for a timestamped JSON export. Packets include the round, public account fields, linked ledger entries, risk events, AI events, AI decision explanations, compliance cases, replay timeline, and integrity counts. The Admin Audit UI can load a selected account round and preview the export without mutating wallet or round state.

Scope:
- Load one round with ledger entries, game outcome, risk events, AI signals, and compliance links.
- Export an evidence packet for a case.
- Preserve deterministic replay data where the game engine supports it.

Acceptance criteria:
- Admins can inspect a round from account detail.
- Evidence export is stable and timestamped.
- Replay never mutates wallet state.

### T35 - Notification Preferences and Delivery Controls

Summary: Add user notification preferences and admin delivery visibility.

Implementation status: Complete. Notification preferences are now persisted for memory and Prisma drivers, optional categories can be muted, mandatory system/risk/admin notices stay enabled, every notification attempt records a delivered or suppressed in-app delivery decision, admins can review delivery outcomes, and the inbox UI exposes preference toggles.

Scope:
- User opt-in and opt-out preferences.
- Category-level notification controls.
- Admin delivery status review.

Acceptance criteria:
- Users can control optional notification categories.
- Required security/compliance notices cannot be disabled.
- Admins can see delivery attempts and failures.

### T36 - VIP Progression and Cashback Rules

Summary: Replace static VIP copy with ledger-backed tier progression and weekly cashback.

Implementation status: Complete. VIP status now calculates tier progression from settled stake, weekly cashback from settled net losses, and once-per-week cashback availability from recorded bonus claims. `/api/vip/status` exposes the current tier packet, `/api/vip/cashback/claim` credits cashback through the wallet ledger, records a `vip-weekly-cashback` bonus claim, creates a notification, and logs a bonus AI event. The VIP UI renders live status, progress, tier thresholds, and claim controls.

Scope:
- Compute VIP tier from settled rounds.
- Compute weekly cashback from net losses.
- Credit cashback through the wallet ledger.
- Prevent duplicate weekly cashback claims.
- Expose status and claim endpoints.
- Add UI, unit tests, and smoke coverage.

Acceptance criteria:
- VIP status changes only from settled rounds.
- Cashback claims create ledger entries and bonus claims.
- Duplicate weekly claims do not credit the wallet again.
- UI shows real tier, progress, and claim availability.

### T37 - Tournament and Leaderboard Engine

Summary: Build backend tournament infrastructure using settled rounds as the source of truth.

Implementation status: Complete. The platform now exposes tournament definitions through `/api/tournaments`, active-only idempotent entry through `/api/tournaments/:id/enter`, and deterministic leaderboards through `/api/tournaments/:id/leaderboard`. Entry fees debit the authoritative wallet ledger with tournament metadata, Prisma mode persists tournament entries, duplicate user entry returns the original entry without another debit, and leaderboard scores are derived only from settled backend rounds after the user entered and inside the tournament window. The UI adds a Tournament Arena tab with entry actions and live leaderboard review.

Scope:
- Tournament definitions with start/end time, entry fee, prize pool, and status.
- Backend tournament service.
- Idempotent user entry.
- Entry fee debited safely through wallet ledger.
- Scores counted only from settled backend rounds.
- Deterministic leaderboard ranking and tie-breaks.
- API and UI coverage.
- Unit and smoke coverage.

Acceptance criteria:
- Users can list tournaments and enter an active tournament.
- Duplicate entry attempts do not double-debit the wallet.
- Tournament entry fees create debit ledger entries.
- Leaderboards ignore open/refunded rounds and pre-entry settled rounds.
- Ranking tie-breaks are deterministic.
- Tournament UI shows definitions, entry controls, and leaderboard state.

### T38 - Prize Payouts and Tournament Settlement

Summary: Close ended tournaments and credit ranked winners safely.

Implementation status: Complete. Tournament settlement now requires ended tournament status, computes the final post-entry leaderboard, distributes the prize pool across ranked winners, credits prize payouts through wallet ledger entries with tournament metadata, stores memory/Prisma settlement and payout records, and returns existing settlement records on duplicate attempts. Admin APIs can review or settle tournaments, the Admin UI exposes settlement status and payout rows, and smoke coverage verifies early-settlement blocking, winner payout, settlement loading, and duplicate settlement idempotency.

Scope:
- Settlement records for tournaments.
- Payout records linked to ranked winners.
- Prize distribution from final leaderboard.
- Wallet ledger credits for prizes.
- Idempotent duplicate settlement handling.
- Admin API and UI coverage.
- Unit and smoke coverage.

Acceptance criteria:
- Active/upcoming tournaments cannot be settled.
- Ended tournaments settle exactly once.
- Prize payouts create wallet ledger credits.
- Duplicate settlement attempts do not double-pay.
- Admins can review settlement and payout evidence.

### T39 - Tournament Evidence Export and Payout Audit

Summary: Add a read-only tournament evidence packet for settlement review and dispute/audit export.

Implementation status: Complete. Admins can now open `/api/admin/tournaments/:id/evidence` for a read-only tournament evidence packet and `/api/admin/tournaments/:id/evidence-export` for a versioned JSON export. Packets include the tournament definition, final leaderboard, settlement and payout rows, participant public account records, linked entry/prize ledger entries, scored rounds, risk events, AI events, AI decision explanations, compliance cases, admin audit events, and integrity counts. The Admin Tournament Settlement panel can load evidence, preview export JSON, and display participant/ledger/audit proof next to payout controls.

Scope:
- Build tournament evidence from authoritative services without mutating settlement or wallet state.
- Link entry-fee debits and prize-payout credits to the tournament packet.
- Include participant scoring context and admin audit events.
- Expose role-protected evidence and JSON export endpoints.
- Add admin UI preview and smoke coverage.

Acceptance criteria:
- Regular users cannot load tournament evidence.
- Evidence export is stable, timestamped, and versioned.
- Evidence includes settlement, payout, entry ledger, and prize ledger proof.
- Evidence review records admin audit telemetry.
- Export/review paths never settle or credit wallets.

### T40 - Tournament Cancellation and Entry-Fee Refunds

Summary: Let admins cancel tournaments and refund paid entries safely.

Implementation status: Complete. Tournament cancellation is now durable in memory and Prisma drivers with cancellation/refund records, cancelled tournaments surface with `cancelled` status, settled tournaments cannot be cancelled, cancelled tournaments cannot be settled, and duplicate cancellation attempts return the original record without double-crediting wallets. Refunds credit entry fees through wallet ledger entries with tournament metadata, create player wallet notifications, emit admin AI audit telemetry, and appear in tournament evidence/export packets with refund ledger integrity counts. The Admin Tournament Settlement panel can review cancellation records, cancel/refund tournaments, and inspect refund rows next to settlement controls.

Scope:
- Persistent tournament cancellation records.
- Refund records linked to entries and ledger credits.
- Idempotent cancellation command.
- Block settlement after cancellation and cancellation after settlement.
- Admin API and UI controls.
- Evidence/export integration.
- Unit and smoke coverage.

Acceptance criteria:
- Cancelling a paid tournament credits each entry fee exactly once.
- Duplicate cancellation attempts do not create duplicate refunds.
- Cancelled tournaments show cancelled status in list and leaderboard packets.
- Settled tournaments cannot be cancelled.
- Cancelled tournaments cannot be settled.
- Admin evidence includes cancellation, refund, and refund-ledger proof.

### T41 - Tournament Dispute Cases

Summary: Link tournament settlement/cancellation evidence into compliance case workflows.

Implementation status: Complete. Admins can now open a tournament dispute from `/api/admin/tournaments/:id/disputes`, which creates a compliance case with tournament evidence references including settlement, cancellation, payout/refund counts, ledger integrity counts, and participant context. Tournament evidence packets now include linked dispute cases and dispute integrity counts. The Admin Tournament Settlement panel exposes an Open dispute case action and renders linked dispute rows in the evidence view. Dispute creation is audited through existing compliance-case AI/risk telemetry.

Scope:
- Create tournament dispute cases from admin tournament evidence.
- Link settlement/cancellation ids and ledger integrity counts into case evidence.
- Include linked dispute cases in tournament evidence/export.
- Add admin UI action and smoke coverage.

Acceptance criteria:
- Admins can open a tournament dispute without manually copying ids.
- Dispute cases appear in the existing compliance queue.
- Tournament evidence includes linked dispute cases.
- Dispute creation emits compliance audit telemetry.
- Regular users cannot open tournament dispute cases.

### T42 - Tournament Admin Filters and Queue

Summary: Give admins a filtered operational queue for tournament settlement, cancellation, and dispute states.

Implementation status: Complete. Admins can now load `/api/admin/tournaments/queue` with filters for all, active, ended, cancelled, settled, disputed, unresolved, and needs-settlement tournaments. Queue rows combine tournament definitions with leaderboard counts, settlement/cancellation records, dispute cases, open dispute counts, current leader, and operational flags. The Admin Audit UI adds a Tournament Queue panel with summary counters, filter buttons, and selectable queue rows that load the existing tournament settlement/evidence workflow. Smoke coverage verifies cancelled/disputed/unresolved flags and unresolved filtering.

Scope:
- Role-protected admin tournament queue endpoint.
- Computed settlement/cancellation/dispute flags.
- Admin UI filter controls and queue rows.
- Refresh queue after settlement, cancellation, and dispute actions.
- Smoke coverage for queue filters.

Acceptance criteria:
- Admins can filter tournaments by active, ended, cancelled, settled, disputed, unresolved, and needs-settlement states.
- Queue rows include enough counts to triage without opening every tournament.
- Selecting a queue row loads the existing leaderboard/detail panel.
- Regular users cannot access the admin queue.

### T43 - Tournament Scheduled Jobs

Summary: Add a safe tournament settlement job runner for ended tournaments.

Implementation status: Complete. Admins can now run `/api/admin/tournaments/jobs/settlement-scan` to scan the computed tournament queue for ended, unsettled, non-cancelled tournaments. The job defaults to dry-run mode, sends admin notifications for detected tournaments, records an admin AI audit event, and returns a report with detected rows, alert counts, and settlement counts. Explicit `autoSettle` mode safely settles only tournaments flagged as needs-settlement, broadcasts winner wallet updates, and sends prize notifications. The Admin Tournament Queue panel exposes Scan + alert and Auto-settle controls with the latest job report, and smoke coverage verifies dry-run detection and admin alerting.

Scope:
- Role-protected settlement scan job endpoint.
- Dry-run detection for ended unsettled tournaments.
- Admin alert notifications and audit telemetry.
- Explicit auto-settle mode.
- Admin UI controls and job report counters.
- Smoke coverage with simulated job clock.

Acceptance criteria:
- Dry-run mode does not move wallet funds.
- Job detects ended, unsettled, non-cancelled tournaments.
- Admins receive settlement-required notifications.
- Auto-settle mode is explicit and uses existing idempotent settlement logic.
- Job output is auditable through returned report and AI events.

### T44 - Tournament Policy Controls

Summary: Add configurable auto-settlement guardrails for tournament jobs.

Implementation status: Complete. Admins can now inspect `/api/admin/tournaments/policy`, and tournament queue rows/job reports include policy decisions with allow/block status, reason codes, and check inputs. Auto-settlement is gated by policy controls for enablement, maximum prize pool, minimum entries, minimum scored entries, dispute-free state, and no-cancellation state. Dry-run reports expose policy blocks without moving funds, while explicit auto-settle skips blocked tournaments and reports policy-blocked counts. The Admin Tournament Queue panel displays policy values, blocked counts, and row-level block reasons. Smoke coverage verifies policy exposure and insufficient-scored-entry blocking before settlement.

Scope:
- Expose auto-settlement policy values.
- Evaluate policy per needs-settlement tournament.
- Block auto-settlement when guardrails fail.
- Include policy decisions in queue and job reports.
- Display policy and block reasons in Admin UI.
- Smoke coverage for policy checks.

Acceptance criteria:
- Auto-settlement cannot bypass configured guardrails.
- Dry-run mode reports policy decisions without wallet movement.
- Admins can see why a tournament is blocked.
- Policy decisions are included in job audit output.

### T45 - Game Math Simulation Harness

Summary: Add repeatable RTP and volatility simulation reports for backend game math.

Implementation status: Complete. Admins can now load `/api/admin/game-math/simulations` for a read-only math report covering exact European roulette scenarios, exact slot reel-strip enumeration, and deterministic crash cashout sampling. Reports include theoretical RTP, house edge, hit rate, volatility index, total stake/payout, max payout, warnings, and summary ranges. The Admin Audit UI exposes a Game Math Simulations panel with report counters and scenario rows. Unit coverage verifies roulette RTP, slot enumeration/warnings, and deterministic crash reports; smoke coverage verifies the admin endpoint and roulette RTP bounds.

Scope:
- Pure simulation service with no wallet mutation.
- Exact roulette RTP scenarios.
- Exact slots reel-strip enumeration.
- Deterministic crash sampling.
- Admin API and UI report.
- Unit and smoke coverage.

Acceptance criteria:
- Simulations are repeatable and auditable.
- Reports include RTP, hit rate, volatility, house edge, and warnings.
- Admins can run reports without affecting wallets or rounds.
- Roulette reports match European roulette expected edge.

### T46 - Blackjack and Poker Strategy Simulation Harness

Summary: Extend game math reports with deterministic blackjack and poker strategy scenarios.

Implementation status: Complete. The admin math report now includes deterministic blackjack flat-bet strategy sampling and Texas Holdem heads-up showdown sampling with explicit no-rake and 5% rake assumptions. Blackjack scenarios reuse the domain scoring, soft-hand detection, dealer draw, and settlement functions; poker scenarios reuse the Texas Holdem evaluator and hand comparison logic. Reports flow through the existing admin API and Game Math Simulations UI, and smoke coverage now verifies roulette, slots, crash, blackjack, and poker buckets are present.

Scope:
- Blackjack sampled strategy reports with no wallet mutation.
- Poker sampled showdown reports with explicit rake assumptions.
- Shared RTP, hit-rate, volatility, house-edge, and warning output.
- Admin API/UI inclusion in the existing math report.
- Unit and smoke coverage for repeatability and scenario presence.

Acceptance criteria:
- Blackjack and poker reports are deterministic for the same sample count.
- Strategy assumptions are visible in scenario descriptions.
- Reports reuse domain math functions rather than duplicating settlement/evaluation rules.
- Admin math report includes all implemented game families.

### T47 - Provably Fair Seed Verification

Summary: Add HMAC-based seed commitments and replay verification for server-generated game outcomes.

Implementation status: Complete. Roulette, slots, and crash now attach provably fair proof metadata to normal server-generated outcomes. Proofs include algorithm, server seed hash, revealed server seed, client seed, nonce, cursor, and the derived result. A shared domain verifier recomputes the server seed hash and HMAC-derived outcome, detects result tampering, and powers `/api/provably-fair/verify`. API smoke coverage spins a real slots round and verifies its stored proof through the endpoint.

Scope:
- HMAC-SHA256 seed derivation utility.
- Server seed hash commitments and revealed proof payloads.
- Roulette index, slots stop, and crash unit-random verification.
- Public verification endpoint and client API helper.
- Unit and smoke coverage for valid and tampered proofs.

Acceptance criteria:
- Default roulette, slots, and crash outcome generation stores replayable proof metadata.
- Verification detects server seed hash mismatches and result tampering.
- Verification does not mutate wallets, rounds, or ledger entries.
- Test overrides remain deterministic without requiring random proof generation.

### T48 - Round Evidence Includes Provably Fair Proofs

Summary: Surface provably fair verification inside read-only round evidence packets and exports.

Implementation status: Complete. Admin round evidence now extracts stored provably fair proof metadata, replays it through the shared verifier, and includes a `provablyFair` evidence block with presence, validity, errors, proof payload, and expected result. Evidence integrity counts now include proof-present and proof-valid counts, and the replay timeline records a `provably_fair_verified` event for rounds with proof metadata. API smoke coverage verifies a real slots round proof appears as valid in admin evidence.

Scope:
- Round evidence proof extraction and verification.
- Integrity counters for proof presence and proof validity.
- Replay timeline event for proof verification.
- Admin UI proof status in the Round Evidence panel.
- Smoke coverage for proof-backed round evidence.

Acceptance criteria:
- Evidence packets expose whether a proof is present and valid.
- Rounds without proof remain readable and report proof absence.
- Evidence proof verification is read-only.
- Exported evidence includes the same proof status as the API packet.

### T49 - User-Facing Provably Fair Inspector

Summary: Let players inspect and verify provably fair proofs for their own rounds.

Implementation status: Complete. Players can now load `/api/rounds/:roundId/provably-fair` for owned rounds, which returns sanitized round data plus the same read-only proof verification block used by admin evidence. The Wallet tab includes a Provably Fair Inspector that refreshes recent rounds, lets players select a round, and displays proof presence, validity, errors, and the stored proof JSON. API smoke coverage verifies a real player slots round is valid through the player-owned proof endpoint.

Scope:
- User-owned proof evidence endpoint.
- Recent round loading client helper.
- Wallet UI proof inspector.
- Smoke coverage for player proof verification.

Acceptance criteria:
- Players can only inspect proofs for their own rounds.
- Inspector shows proof presence, validity, and errors.
- Verification is read-only and reuses the shared verifier.
- Rounds without proofs remain inspectable with a clear absence state.

### T50 - Provably Fair Seed Lifecycle

Summary: Add committed/revealed seed lifecycle records with nonce tracking for provably fair games.

Implementation status: Complete. Memory mode now has a provably fair seed lifecycle service that creates idempotent server-seed commitments, hashes server seeds before play, increments per-user/game nonces, reveals seeds after instant roulette/slots settlement, and defers crash seed reveal until cashout settlement. Players can review their seed records through `/api/provably-fair/seeds`, where committed seeds hide the server seed and revealed seeds expose it with round linkage. Smoke coverage verifies a real slots round produces a revealed seed lifecycle record.

Scope:
- Memory seed lifecycle service.
- Idempotent commitment keys and per-user/game nonce tracking.
- Instant roulette/slots reveal wiring.
- Deferred crash commitment/reveal wiring.
- Player seed lifecycle endpoint.
- Unit and smoke coverage.

Acceptance criteria:
- Server seed hashes are available before reveal.
- Revealed seed records include server seed, round id, client seed, nonce, and timestamps.
- Crash start stores a commitment without revealing the server seed.
- Seed review is user-owned and read-only.
- Prisma persistence for seed lifecycle records is explicitly left for the next persistence hardening ticket.

### T51 - Persist Provably Fair Seed Lifecycle

Summary: Add Prisma persistence for committed and revealed provably fair seed records.

Implementation status: Complete. Prisma mode now has a `provably_fair_seeds` table with committed/revealed status, private server seed storage, server seed hash, client seed, nonce, idempotent commitment key, optional round linkage, and reveal timestamps. The service factory selects `PrismaProvablyFairSeedService` in Prisma mode and `MemoryProvablyFairSeedService` in memory mode behind the same API. The migration enforces unique commitment keys and per-user/game nonces. The quality gate validates the schema, TypeScript, unit tests, build, and memory API smoke path.

Scope:
- Prisma enum/model for seed lifecycle status and records.
- Forward SQL migration for `provably_fair_seeds`.
- Prisma-backed commit, reveal, get, and list methods.
- Service factory persistence switch.
- Local Prisma client generation and quality validation.

Acceptance criteria:
- Seed commitments survive process restarts in Prisma mode.
- Commitment keys are idempotent.
- Per-user/game nonces are unique.
- Revealed records can link to settled rounds.
- Public seed lists hide server seeds until reveal.

### T52 - Prisma Seed Lifecycle Smoke Path

Summary: Extend Prisma-mode smoke coverage for persisted provably fair seed lifecycle records.

Implementation status: Complete. The Prisma smoke script now verifies the persisted seed lifecycle path in addition to wallet settlement. It commits a provably fair seed through `PrismaProvablyFairSeedService`, verifies duplicate commitment idempotency, reveals the seed with round linkage, and confirms the user-visible seed list exposes the revealed server seed. This gives production-mode operators a focused smoke check after running `npm run db:deploy`.

Scope:
- Prisma smoke coverage for seed commit/reveal/list.
- Duplicate commitment idempotency assertion.
- Round-linked reveal assertion.
- Revealed server seed visibility assertion.

Acceptance criteria:
- `npm run smoke:prisma` exercises persisted seed lifecycle records.
- The smoke fails if commitment idempotency breaks.
- The smoke fails if reveal or round linkage is not persisted.
- The smoke remains separate from memory-mode `npm run quality` because it requires a real configured database.

### T53 - Prisma Full API Smoke

Summary: Add a focused Prisma-backed Express API smoke test.

Implementation status: Complete. The project now has `npm run smoke:api:prisma`, which starts the bundled server with `CASINO_BACKEND_DRIVER=prisma`, registers unique regular/admin users, verifies wallet creation, spins a real slots round, replays the provably fair proof, checks the player proof inspector endpoint, verifies the persisted seed lifecycle list, and confirms admin round evidence proof integrity. This complements direct Prisma service smoke coverage by exercising the deployed API surface against a configured database.

Scope:
- Bundled server startup in Prisma mode.
- Unique smoke users to avoid persistent database collisions.
- Wallet, slots, proof verification, seed lifecycle, and admin evidence API checks.
- Package script for repeatable operator use.

Acceptance criteria:
- Prisma API smoke uses the production bundle.
- Smoke fails if Prisma auth/wallet/game/proof endpoints break.
- Smoke is safe to repeat against a persistent database.
- Smoke remains opt-in because it requires real database credentials.

### T54 - Prisma Smoke Cleanup and Isolation

Summary: Make Prisma smoke checks disposable against persistent databases.

Implementation status: Complete. The direct Prisma smoke script now creates a temporary smoke user with an isolated wallet, runs wallet settlement and provably fair seed lifecycle checks against that user, and deletes the user at the end. The Prisma API smoke script tracks its registered user and admin accounts, stops the bundled server, and deletes those users through Prisma cleanup so repeated smoke runs do not accumulate player accounts, wallets, rounds, ledger entries, sessions, or seed records.

Scope:
- Disposable service-level Prisma smoke user.
- Cleanup for Prisma API smoke regular and admin users.
- Cascading removal of smoke wallet, ledger, round, auth session, and seed records.
- Repeat-safe smoke behavior for shared persistent databases.

Acceptance criteria:
- `npm run smoke:prisma` does not mutate the seeded demo account.
- `npm run smoke:api:prisma` removes registered smoke users after completion.
- Cleanup runs even when smoke assertions fail after user creation.
- Existing smoke assertions still cover wallet settlement, slots, proof verification, seed lifecycle, and admin evidence integrity.

### T55 - Prisma Transaction Retry Hardening

Summary: Retry transient Prisma transaction conflicts in persistent casino services.

Implementation status: Complete. Prisma casino money-moving writes and provably fair seed lifecycle writes now run through a shared transaction retry wrapper that retries transient write-conflict, deadlock, and serialization-failure errors. The retry stays behind existing idempotency keys for wallet credits, debits, bet locks, settlement, refunds, outcome updates, added stakes, and seed commitments, preserving business invariants while making the persistent backend more tolerant of real database contention.

Scope:
- Shared retry wrapper for Prisma write transactions.
- Retry detection for Prisma `P2034` conflicts and equivalent database messages.
- Coverage across wallet credit/debit, bet lock, settlement, refund, outcome update, added stake, seed commit, and seed reveal paths.
- Keep smoke scripts as plain API checks so resilience is proven in the backend service.

Acceptance criteria:
- Transient Prisma write conflicts are retried before surfacing to API callers.
- Non-transient validation and business-rule errors are not retried.
- Existing idempotency behavior remains unchanged.
- `npm run smoke:api:prisma` can pass without its own write-conflict retry shim.

### T56 - Prisma Seed Nonce Concurrency Hardening

Summary: Allocate provably fair seed nonces through an atomic Prisma counter table.

Implementation status: Complete. Prisma mode now stores one nonce counter row per user/game in `provably_fair_seed_nonces`, backfilled from existing seed records during migration. Seed commitment takes a transaction-scoped Postgres advisory lock for the user/game pair, then reserves the next nonce with a transactional upsert/increment before inserting the seed, replacing the previous latest-seed scan. This explicit critical section runs at `ReadCommitted`, while the existing unique `(userId, gameId, nonce)` constraint remains as a final database invariant and transaction retries handle transient contention. The direct Prisma smoke now commits multiple seeds concurrently for the same user/game and asserts contiguous unique nonces.

Scope:
- Prisma model and migration for per-user/game seed nonce counters.
- Migration backfill from existing `provably_fair_seeds`.
- Transaction-scoped advisory lock for per-user/game seed allocation.
- Atomic nonce reservation in `PrismaProvablyFairSeedService.commit`.
- Concurrent nonce assertion in `npm run smoke:prisma`.
- Preserve idempotent commitment-key behavior and seed cleanup cascades.

Acceptance criteria:
- Concurrent Prisma seed commits do not allocate the same nonce by reading stale latest rows.
- Existing databases get counters initialized to `MAX(nonce) + 1`.
- Deleting a user cascades seed records and nonce counters.
- Prisma service and API smoke checks continue to pass against the configured database.

### T57 - Prisma Round and Wallet Concurrency Stress Smoke

Summary: Stress concurrent Prisma bet and settlement flows against one wallet.

Implementation status: Complete. Prisma wallet mutations now take a transaction-scoped advisory lock per user before changing balances, rechecking idempotency inside the critical section for credits, debits, bet locks, and added stakes. Money-moving transactions run at `ReadCommitted` behind that explicit wallet lock, keeping one authoritative mutation stream per wallet while retaining retry handling for transient database conflicts. The direct Prisma smoke now places and settles multiple rounds concurrently for one user, then verifies ledger counts, final available balance, and zero locked balance.

Scope:
- Per-user advisory lock for Prisma wallet mutations.
- Idempotency replay checks after lock acquisition.
- Concurrent direct Prisma smoke for bet locking and settlement.
- Ledger-count and wallet-balance invariants after the stress wave.

Acceptance criteria:
- Concurrent `placeBet` calls against one wallet do not corrupt available or locked balances.
- Concurrent settlement calls clear locked balances and post one settlement ledger entry per round.
- Idempotent replay behavior remains intact when writers race.
- `npm run smoke:prisma` proves the wallet stress path against the configured database.

### T58 - API-Level Wallet Concurrency Smoke

Summary: Stress concurrent Prisma wallet writes through the production Express API.

Implementation status: Complete. The Prisma API smoke now runs multiple concurrent slot spins for one authenticated user through `/api/games/slots/spin`, then verifies the final wallet balance from actual returned payouts, checks locked balance returns to zero, confirms one lock and one settlement ledger entry per stress spin through `/api/wallet/:userId/ledger`, and verifies the stress rounds are persisted as settled through `/api/rounds`.

Scope:
- Concurrent Prisma-backed slot spins through the bundled Express server.
- Wallet invariant assertion using actual spin payouts.
- Ledger lock/settlement count assertions through HTTP.
- Persisted settled-round assertions through HTTP.

Acceptance criteria:
- API-level concurrent slot spins cannot leave stale locked balance.
- Final wallet available balance matches charged stakes and returned payouts.
- Ledger entries prove one lock and one settlement per stress spin.
- The stress path runs inside `npm run smoke:api:prisma`.

### T59 - Idempotency Replay API Smoke

Summary: Prove concurrent HTTP replay requests with the same idempotency key do not double-apply wallet or seed effects.

Implementation status: Complete. The Prisma API smoke now sends two concurrent `/api/games/slots/spin` requests with the same idempotency key, verifies both responses resolve to the same settled round and payout, checks the final wallet balance only reflects one charged stake and one payout, confirms exactly one lock and one settlement ledger entry exist for the replay key, and verifies exactly one revealed provably fair seed record is linked to the replayed round.

Scope:
- Concurrent same-key slot spin replay through the bundled Express server.
- Wallet available/locked invariant after replay.
- Ledger idempotency assertions for lock and settlement entries.
- Provably fair seed replay assertion for the linked round.

Acceptance criteria:
- Same-key concurrent API replays return the same round.
- Wallet balance changes once, not once per replay request.
- Ledger contains one lock and one settlement entry for the replay key.
- Provably fair seed lifecycle records are not duplicated for the replayed round.

### T60 - Prisma Idempotency Conflict Semantics

Summary: Reject same-key API replays when material request parameters change.

Implementation status: Complete. Slot-spin API requests now check an existing idempotency key against the persisted round outcome before committing new seed or wallet work. Exact same-key replays remain safe, but a reused key with different slot parameters returns a `409 Idempotency conflict`. The Prisma API smoke verifies the conflict response and confirms wallet balance, locked balance, ledger counts, and linked seed records remain unchanged after the rejected request.

Scope:
- Slots idempotency compatibility check for machine, bet, free-spin flag, and bonus multiplier.
- `409` API status for idempotency conflicts.
- Prisma API smoke coverage for conflicting same-key replay.
- No extra wallet, ledger, round, or seed effects after conflict rejection.

Acceptance criteria:
- Same-key replays with changed slots parameters are rejected.
- Conflict responses use HTTP 409.
- Wallet and locked balances stay unchanged after conflict rejection.
- Ledger and seed counts for the original replayed round stay unchanged.

### T61 - General Idempotency Conflict Registry

Summary: Persist request fingerprints for idempotency keys and use them for conflict detection.

Implementation status: Complete. The platform now has a shared memory/Prisma idempotency service that stores a stable request fingerprint per user, scope, and idempotency key. Prisma mode persists those fingerprints in `idempotency_requests` with user cascade cleanup and a unique `(userId, scope, idempotencyKey)` constraint. Slot spins now use the registry for exact replay/conflict semantics, replacing the previous route-specific round comparison. The Prisma API smoke verifies the replay key is recorded once while exact replay succeeds and changed-parameter replay returns `409`.

Scope:
- Memory and Prisma idempotency request registry.
- Prisma model and migration for durable request fingerprints.
- Stable canonical payload hashing for replay comparison.
- Slot-spin route integration as the first registry-backed operation.
- Prisma API smoke assertion for persisted registry count.

Acceptance criteria:
- Exact same-key request fingerprints are accepted as replays.
- Changed same-key fingerprints are rejected with `409`.
- Prisma mode persists one registry record per user/scope/key.
- Deleting smoke users cascades registry records during cleanup.

### T62 - Expand Idempotency Registry to Roulette and Crash

Summary: Apply shared idempotency request fingerprints to roulette spin and crash start APIs.

Implementation status: Complete. Roulette spins and crash round starts now use the shared idempotency registry before seed or wallet work begins. Roulette fingerprints canonicalize the bet slip, while crash-start fingerprints capture the stake. The Prisma API smoke now verifies exact replay and changed-parameter conflict behavior for slots, roulette, and crash start, and confirms each scope persists exactly one registry row for the replay key.

Scope:
- Registry-backed `/api/games/roulette/spin` requests.
- Registry-backed `/api/games/crash/start` requests.
- Canonical roulette bet-slip payloads for request fingerprinting.
- Prisma API smoke replay/conflict assertions for roulette and crash start.

Acceptance criteria:
- Roulette same-key exact replay returns the original round.
- Roulette same-key changed bet slip returns `409`.
- Crash start same-key exact replay returns the original round.
- Crash start same-key changed stake returns `409`.
- Prisma registry records one row per user/scope/key for these replay checks.

### T63 - Extend Idempotency Registry to Blackjack and Poker

Summary: Apply shared idempotency fingerprints to blackjack and poker routes.

Implementation status: Complete. Blackjack and poker start/action routes now use the shared idempotency registry before mutating game state. Start requests fingerprint stake/ante, while action requests fingerprint round and action. The Prisma API smoke verifies exact replay and changed-parameter conflict behavior for blackjack and poker start routes and confirms one registry row per replay key.

Scope:
- Registry-backed `/api/games/blackjack/start` requests.
- Registry-backed `/api/games/blackjack/:roundId/action` requests.
- Registry-backed `/api/games/poker/start` requests.
- Registry-backed `/api/games/poker/:roundId/action` requests.
- Prisma API smoke replay/conflict assertions for blackjack and poker starts.

Acceptance criteria:
- Blackjack same-key exact start replay returns the original round.
- Blackjack same-key changed stake returns `409`.
- Poker same-key exact start replay returns the original round.
- Poker same-key changed ante returns `409`.
- Blackjack and poker action routes are protected by the shared registry before state mutation.

### T64 - Idempotency Action Route Smoke Coverage

Summary: Prove blackjack and poker action-route replay/conflict behavior through the Prisma API smoke.

Implementation status: Complete. The Prisma API smoke now starts dedicated blackjack and poker rounds, applies settling actions with explicit idempotency keys, replays the same action key, and verifies the replay returns the same settled round. It also sends changed actions with the same keys and expects `409`, then confirms exactly one registry row exists for each action key.

Scope:
- Blackjack action replay smoke using `stand`.
- Blackjack action conflict smoke using changed action on the same key.
- Poker action replay smoke using `fold`.
- Poker action conflict smoke using changed action on the same key.
- Registry count assertions for blackjack and poker action scopes.

Acceptance criteria:
- Blackjack same-key action replay returns the same settled round.
- Blackjack same-key changed action returns `409`.
- Poker same-key action replay returns the same settled round.
- Poker same-key changed action returns `409`.
- Prisma registry records one row per action replay key.

### T65 - Safer Action Replay Responses

Summary: Store successful mutation responses for action-route idempotency keys and return those stored bodies on exact replay.

Implementation status: Complete. The shared idempotency service now supports a response replay envelope in memory and Prisma drivers. Blackjack and poker action routes use it so the first successful action stores its response, exact same-key replays return the stored response without running the game engine again, and changed same-key payloads still return `409`. The Prisma API smoke now covers non-settling blackjack `hit` and poker `check` replays, proving that replay does not draw another card or advance community cards. Heavy math simulation tests also have explicit timeouts so the quality gate remains stable on slower local runs.

Scope:
- Memory idempotency response storage for successful mutation results.
- Prisma idempotency response storage inside existing `idempotency_requests.metadata`.
- Stored-response replay for `/api/games/blackjack/:roundId/action`.
- Stored-response replay for `/api/games/poker/:roundId/action`.
- Prisma API smoke coverage for non-settling blackjack `hit` replay.
- Prisma API smoke coverage for non-settling poker `check` replay.
- Stable test timeouts for heavier math simulation scenarios.

Acceptance criteria:
- Blackjack same-key `hit` replay returns the original hit response without drawing another card.
- Poker same-key `check` replay returns the original check response without advancing community cards.
- Changed same-key action payloads continue to return `409`.
- Stored response replay does not rebroadcast wallet changes or reassess settled risk.
- Local quality gate passes.

### T66 - Registry-Backed Non-Game Idempotency

Summary: Apply shared idempotency fingerprints and stored-response replay to non-game money and operations routes.

Implementation status: Complete. Bonus claim, VIP cashback, raw wallet bet, round settlement, round refund, tournament entry, admin tournament cancellation, admin tournament settlement, and tournament settlement-scan routes now use the shared idempotency registry before mutating state. Successful exact replays return stored responses and skip duplicate wallet broadcasts, notifications, AI/audit events, and risk assessment side effects. Changed same-key payloads return `409 Idempotency conflict`. The memory API smoke verifies conflict behavior across bonus, wallet bet, round settlement, tournament entry, tournament cancellation, settlement job, and tournament settlement routes; the Prisma API smoke is prepared with focused raw-wallet and bonus replay/conflict checks for approved live DB runs.

Scope:
- Stored-response idempotency for bonus claim and VIP cashback claim.
- Stored-response idempotency for `/api/bets`, `/api/rounds/:roundId/settle`, and `/api/rounds/:roundId/refund`.
- Stored-response idempotency for tournament entry, cancellation, settlement, and settlement-scan job routes.
- Canonical payload fingerprints for non-game mutation parameters.
- Memory API smoke coverage for non-game changed-parameter conflicts.
- Prisma API smoke coverage for wallet bet and bonus claim replay/conflict paths.

Acceptance criteria:
- Changed same-key non-game mutation payloads return `409`.
- Exact replays return stored responses instead of duplicating notifications, AI events, risk events, or wallet broadcasts.
- Existing service-level idempotency remains intact behind route-level conflict protection.
- Local quality gate passes.

### T67 - Idempotency Replay and Conflict Audit Events

Summary: Record searchable audit events for idempotency replay and conflict decisions.

Implementation status: Complete. The shared idempotency service now accepts an audit sink and emits decision events for exact replays, in-progress replays, and changed-payload conflicts. The service factory persists those decisions through the existing risk-event pipeline as `idempotency_replay`, `idempotency_in_progress_replay`, and `idempotency_conflict`, including scope, idempotency key, request fingerprint, and route metadata. Unit coverage verifies replay/conflict audit emission, and the memory API smoke verifies replay and conflict events are searchable through `/api/risk/events`.

Scope:
- Optional idempotency audit sink for memory and Prisma idempotency services.
- Searchable risk-event records for exact replay decisions.
- Searchable risk-event records for changed-payload conflicts.
- Route/scope/key/fingerprint metadata in audit context.
- Unit coverage for audit hook emission.
- Memory API smoke coverage for admin-visible audit events.

Acceptance criteria:
- Exact same-key replays create an `idempotency_replay` audit event.
- Changed same-key payloads create an `idempotency_conflict` audit event before returning `409`.
- Audit events are queryable through the existing admin risk-events endpoint.
- Existing idempotency replay/conflict behavior remains unchanged.
- Local quality gate passes.

### T68 - Wallet and Round Reconciliation Job

Summary: Add a read-only integrity reconciliation report for wallets, ledger entries, rounds, and provably fair seed linkage.

Implementation status: Complete. The platform now has a memory/Prisma reconciliation service and an admin-only `/api/admin/integrity/reconciliation` endpoint. The report checks wallet balances against the latest ledger state, locked balances against open round stake, ledger references to wallets and rounds, round lock/settlement ledger coverage, closed-round settlement keys/timestamps, and Prisma provably fair seed linkage for settled roulette/slots/crash rounds. The endpoint records an admin AI audit event with pass/fail summary and returns `409` only when critical issues are found. Unit coverage verifies a clean memory ledger/round state passes, and the memory API smoke runs the reconciliation after full wallet/tournament flows.

Scope:
- Read-only reconciliation service for memory mode using casino snapshots.
- Read-only reconciliation service for Prisma mode using wallets, ledger entries, rounds, and seed tables.
- Admin reconciliation endpoint with pass/warning/fail status.
- Wallet-vs-ledger and open-lock invariant checks.
- Round ledger linkage and closed-round settlement checks.
- Provably fair seed linkage checks for Prisma settled fair games.
- Smoke coverage for the admin endpoint.

Acceptance criteria:
- Clean smoke data returns a passing reconciliation report.
- Critical integrity mismatches are represented as report issues.
- Reconciliation does not mutate balances, rounds, ledger entries, or seeds.
- Admin run is audit-visible through AI event telemetry.
- Local quality gate passes.

### T69 - Admin Integrity Dashboard

Summary: Surface the wallet and round reconciliation report in the Admin Audit dashboard.

Implementation status: Complete. The Admin Audit view now includes an Integrity Reconciliation panel that can run the read-only reconciliation endpoint, show pass/warning/fail status, display wallet, ledger, round, seed, critical, and warning counts, and list the latest reconciliation issues. The typed API client now exposes the reconciliation report DTO and admin run helper. Browser verification confirmed the dashboard renders the report and lists current Prisma seed-link warnings without layout breakage.

Scope:
- Typed reconciliation report DTOs in the frontend API client.
- Admin-only UI action for `/api/admin/integrity/reconciliation`.
- Status, mode, timestamp, summary metrics, and issue rows in Admin Audit.
- Operator notification for pass, warning, fail, and request failure outcomes.
- Browser verification of the dashboard report panel.

Acceptance criteria:
- Admin users can run reconciliation from the Admin Audit dashboard.
- The panel shows summary counts and up to six current issues.
- Clean reports show an explicit no-issues row.
- Critical reports produce an error notification.
- Local quality gate passes.

### T70 - Production Static Asset Serving

Summary: Serve the built Vite client from `dist` in production instead of the source development HTML.

Implementation status: Complete. The production Express branch now serves static files from the bundled server directory and falls back to `dist/index.html`, which points at hashed production assets under `/assets`. Browser verification confirmed the production URL renders the private access screen instead of a blank shell, console warnings/errors are clean, and the Register/Login tab interaction updates the rendered form.

Scope:
- Correct production static root for the bundled Express server.
- Correct SPA fallback path for built `dist/index.html`.
- Production browser render check for the first meaningful app screen.
- Interaction check for the auth mode toggle.

Acceptance criteria:
- `NODE_ENV=production node dist/server.js` serves built HTML with `/assets/...` references.
- The production browser page is not blank.
- The first auth screen renders meaningful app content.
- A visible auth interaction works without console warnings or errors.
- Local lint and production build pass.

### T71 - Production Client Smoke Regression Guard

Summary: Add automated smoke coverage that catches production blank-page asset regressions.

Implementation status: Complete. The memory API smoke now validates the bundled production client immediately after the server becomes ready. It fetches `/`, rejects development HTML that still points to `/src/main.tsx`, verifies hashed JavaScript and CSS assets under `/assets` are present and readable, and confirms the SPA fallback returns the same built client shell. This places the T70 production serving fix under the regular `npm run quality` gate.

Scope:
- Production root HTML smoke check.
- Built JavaScript and CSS asset reachability checks.
- SPA fallback smoke check for a deep route.
- Regression failure for development `index.html` served in production.

Acceptance criteria:
- `npm run smoke:api` fails if production serves `/src/main.tsx`.
- `npm run smoke:api` fails if built JS or CSS assets are missing/unreadable.
- `npm run smoke:api` fails if the SPA fallback does not serve the built client shell.
- Existing memory API smoke coverage still passes.
- Local quality gate passes.

### T72 - Trust Copy Cleanup for Private Platform Tone

Summary: Remove remaining visible mock, sandbox, and demo wording from the app UI.

Implementation status: Complete. Wallet funding, withdrawal, settings, and design-preview UI copy now uses private-platform language instead of mock/sandbox/demo wording. The cleanup preserves the current private test-flow behavior while avoiding player-facing text that implies the platform is fake or throwaway.

Scope:
- Wallet deposit helper copy.
- Deposit method label.
- Withdrawal success notification.
- Settings save notification.
- Design-preview banner and action label.
- Promotion preview payment-rail copy.

Acceptance criteria:
- `src/App.tsx` has no remaining visible `mock`, `sandbox`, or `demo` wording.
- Copy stays honest about private test rails and preview surfaces.
- No gameplay, wallet, or API behavior changes.
- Local quality gate passes.

### T73 - Ledger-Backed Private Wallet Deposits

Summary: Move the private payment desk deposit buttons from local balance changes to authoritative backend ledger credits.

Implementation status: Complete. The platform now exposes an authenticated `/api/wallet/deposits` route that validates private deposit rail method and amount, credits the wallet through the shared ledger service, stores idempotent replay responses, broadcasts wallet updates, creates wallet notifications, and records wallet AI telemetry. The frontend payment desk calls this route for card, crypto, and bank-wire test rails instead of mutating local state. Memory API smoke coverage verifies deposit crediting, exact replay, changed-payload conflict, single ledger entry creation, and wallet notification visibility on an isolated deposit user.

Scope:
- Authenticated wallet deposit API.
- Method and amount validation for private payment rails.
- Shared idempotency registry coverage for deposit replay/conflict.
- Ledger-backed credit through `CasinoService.creditWallet`.
- Wallet broadcast, notification, and AI event telemetry.
- Frontend payment desk integration with per-method loading states.
- Smoke coverage for deposit ledger and notification behavior.

Acceptance criteria:
- Deposit buttons update wallet balance from backend response.
- Exact same-key deposit replay returns the original deposit response.
- Changed same-key deposit payload returns `409`.
- Deposit creates exactly one wallet credit ledger entry.
- Deposit creates a wallet notification.
- Local quality gate passes.

### T74 - Ledger-Backed Private Wallet Withdrawals

Summary: Move the private payment desk withdrawal action from local balance changes to authoritative backend ledger debits.

Implementation status: Complete. The platform now exposes an authenticated `/api/wallet/withdrawals` route that validates private withdrawal rail method and amount, debits the wallet through the shared ledger service, stores idempotent replay responses, broadcasts wallet updates, creates wallet notifications, and records wallet AI telemetry. The frontend withdrawal button calls this route and updates visible balance from the backend response instead of mutating local state. Memory API smoke coverage verifies withdrawal debiting, exact replay, changed-payload conflict, single ledger entry creation, and wallet notification visibility on the isolated deposit/withdrawal user.

Scope:
- Authenticated wallet withdrawal API.
- Method and amount validation for private payment rails.
- Shared idempotency registry coverage for withdrawal replay/conflict.
- Ledger-backed debit through `CasinoService.debitWallet`.
- Wallet broadcast, notification, and AI event telemetry.
- Frontend withdrawal integration with loading state.
- Smoke coverage for withdrawal ledger and notification behavior.

Acceptance criteria:
- Withdrawal button updates wallet balance from backend response.
- Exact same-key withdrawal replay returns the original withdrawal response.
- Changed same-key withdrawal payload returns `409`.
- Withdrawal creates exactly one wallet debit ledger entry.
- Withdrawal creates a wallet notification.
- Local quality gate passes.

### T75 - Prisma Payment Rail API Smoke Coverage

Summary: Extend the persistent-backend API smoke to cover private wallet deposits and withdrawals.

Implementation status: Complete. The Prisma API smoke now exercises `/api/wallet/deposits` and `/api/wallet/withdrawals` against the bundled production server in Prisma mode. It verifies deposit crediting, withdrawal debiting, exact replay responses, changed-payload `409` conflicts, and single ledger-entry persistence for both payment-rail directions before continuing through the existing game, seed, idempotency, and concurrency checks.

Scope:
- Prisma API smoke deposit request and replay.
- Prisma API smoke deposit conflict check.
- Prisma API smoke withdrawal request and replay.
- Prisma API smoke withdrawal conflict check.
- Ledger count assertions for persisted deposit and withdrawal entries.

Acceptance criteria:
- Prisma API smoke catches missing deposit persistence.
- Prisma API smoke catches missing withdrawal persistence.
- Replayed payment rail requests return original references and balances.
- Changed same-key payment rail requests return `409`.
- Local static/type/build quality gate passes.

### T76 - Backend-Backed Settings Consent Save

Summary: Wire the Settings save action to the authenticated backend consent endpoint.

Implementation status: Complete. The Settings panel now calls `/api/auth/consent` through the typed API client instead of only showing a local success notification. The frontend updates the active auth session from the backend response, shows a loading state while saving, and reports backend errors through the existing notification surface. The memory API smoke verifies that consent saves return updated age, terms, and privacy timestamps.

Scope:
- Typed frontend helper for `/api/auth/consent`.
- Settings save handler that updates `authSession` from backend response.
- Button loading/disabled state while settings are saving.
- Memory API smoke coverage for persisted consent timestamps.

Acceptance criteria:
- Settings Save Changes calls the backend.
- Successful save updates the active session object.
- Failed save shows an error notification.
- Consent endpoint returns updated timestamps in smoke coverage.
- Local quality gate passes.

### T77 - Support Request Submission Hardening

Summary: Add frontend failure handling and smoke coverage for backend-backed support requests.

Implementation status: Complete. The support form now tracks an in-flight submit state, disables the submit button while the backend notification request is pending, preserves the existing success confirmation on delivery, and reports backend failures through the standard error notification path. The memory API smoke now verifies a normal support request is delivered with metadata before separately verifying muted support suppression behavior.

Scope:
- Support form submit loading state.
- Disabled submit button during in-flight request.
- Try/catch error handling for backend notification creation.
- Smoke coverage for delivered support notification metadata.
- Existing muted support suppression smoke preserved.

Acceptance criteria:
- Support form cannot double-submit while the request is pending.
- Backend notification failures show an error.
- Successful support requests still show the submitted state.
- Smoke coverage verifies delivered and suppressed support paths.
- Local quality gate passes.

### T78 - Backend-Backed Profile Display Name Save

Summary: Wire the Personal Desk profile save action to the authenticated backend profile endpoint.

Implementation status: Complete. The Personal Desk now exposes a display-name input and saves it through `/api/auth/profile` via a typed frontend helper. The active auth session and visible user name update from the backend response, the save button has a loading/disabled state, and empty display names are rejected client-side before submission. Memory API smoke coverage verifies profile display-name updates persist through `/api/auth/session`.

Scope:
- Typed frontend helper for `/api/auth/profile`.
- Personal Desk display-name input.
- Backend-backed profile save handler.
- Loading/disabled state for profile save.
- Smoke coverage for profile update and session restore.

Acceptance criteria:
- Personal Desk Save settings calls the backend.
- Successful save updates the visible display name.
- Empty display names are rejected before submission.
- Restored auth session includes the updated display name.
- Local quality gate passes.

### T79 - Backend-Backed Profile Email Save

Summary: Extend the Personal Desk profile save flow to update registered email through the backend profile endpoint.

Implementation status: Complete. The Personal Desk now exposes a registered-email input, synchronizes it from the active auth session, and submits it together with display name through `/api/auth/profile`. Successful saves refresh the active auth session and input state from the backend response. Memory API smoke coverage verifies that profile email updates persist through `/api/auth/session`.

Scope:
- Personal Desk registered-email input.
- Auth-session synchronization for profile email state.
- Profile save payload includes optional email.
- Smoke coverage for profile email update and session restore.

Acceptance criteria:
- Personal Desk can save a registered email.
- Successful save updates the active session email.
- Restored auth session includes the updated email.
- Existing display-name save behavior remains intact.
- Local quality gate passes.

### T80 - Backend-Backed Account Closure Request

Summary: Replace the Settings profile reset action with an auditable backend-backed account closure review request.

Implementation status: Complete. The Settings danger-zone action no longer mutates frontend-only profile, wallet, or play totals. It now asks for confirmation, creates a support notification with `account_closure` metadata through the authenticated backend, refreshes notifications, and tells the player that ledger and audit history remain preserved. The memory API smoke verifies that the backend delivers the closure request and stores the request metadata.

Scope:
- Account closure request loading state.
- Settings danger-zone handler backed by `/api/notifications`.
- Copy that preserves ledger and audit history instead of promising browser-side deletion.
- Memory API smoke coverage for delivered account closure request metadata.

Acceptance criteria:
- Settings no longer zeroes wallet/profile totals locally.
- Account closure review requests call the backend.
- Successful requests refresh notifications and show a success message.
- Smoke coverage verifies delivered `account_closure` metadata.
- Local quality gate passes.

### T81 - Persist Responsible Play Session Timeout

Summary: Store the Settings responsible-play session timeout selection in backend user state.

Implementation status: Complete. The Settings timeout select now saves through `/api/auth/consent` together with the consent flags instead of firing a local-only notification. Auth session payloads include `sessionTimeoutLimit`, restored sessions hydrate the select from the backend, and invalid timeout values are rejected. A Prisma migration adds the persisted user field with the existing `30 mins` default, and the memory API smoke verifies save, validation, and session restore behavior.

Scope:
- User `sessionTimeoutLimit` schema field and migration.
- Auth service validation and default timeout behavior.
- Consent/settings API payload extension.
- Settings UI hydration and Save Changes persistence.
- Memory API smoke coverage for valid, invalid, and restored timeout values.

Acceptance criteria:
- Timeout changes are not treated as saved until Save Changes is used.
- Saved timeout values return in the auth session.
- Restored sessions hydrate the Settings select from backend state.
- Invalid timeout values return `400`.
- Local quality gate passes.

### T82 - Enforce Responsible Play Session Timeout

Summary: Block new wagering play when an authenticated session exceeds the saved responsible-play timeout.

Implementation status: Complete. Auth sessions now expose `createdAt`, and new wagering entry points use a `requirePlayableSession` guard that compares session age with the saved `sessionTimeoutLimit`. Timed-out sessions receive a `403` response before new rounds are created, and the platform records a `responsible_play_session_timeout` risk event for admin review. Existing account, wallet, evidence, and in-round ownership flows remain available through normal auth. The memory API smoke uses a memory-only session-age header to verify timeout enforcement without waiting in real time.

Scope:
- Auth session `createdAt` DTO support.
- Session timeout duration enforcement helper.
- New-play route guards for bets and game starts/spins.
- Risk event creation when timeout enforcement blocks play.
- Memory API smoke coverage for blocked timed-out play and admin-visible risk event.

Acceptance criteria:
- New play is blocked after the saved session timeout.
- Timeout enforcement returns `403` before a new round is created.
- Timeout blocks generate a responsible-play risk event.
- Non-play authenticated routes still use normal auth.
- Local quality gate passes.

### T83 - Responsible Play Acknowledgement Audit

Summary: Persist player acknowledgement for responsible-play warnings and cooldowns.

Implementation status: Complete. Responsible-play interventions now include an optional `acknowledgedAt` audit field, and players can acknowledge required interventions through a dedicated backend endpoint. The acknowledgement updates memory and Prisma-backed services, appears in admin review lists, and logs a `responsible_play_acknowledged` AI/risk audit event. The memory API smoke verifies acknowledgement timestamp persistence, admin visibility, and audit-event logging.

Scope:
- `acknowledgedAt` schema field and migration.
- Responsible-play service `acknowledge` method for memory and Prisma drivers.
- Player acknowledgement endpoint.
- Typed frontend API helper for acknowledgement.
- Memory API smoke coverage for acknowledgement and audit visibility.

Acceptance criteria:
- Required responsible-play interventions can be acknowledged by the owning player.
- Acknowledgements persist with timestamps.
- Admin review includes acknowledgement state.
- Acknowledgement emits an audit event.
- Local quality gate passes.

### T84 - Player Responsible Play Acknowledgement UI

Summary: Surface required responsible-play acknowledgements in the player app and submit them to the backend.

Implementation status: Complete. Game responses that include a required responsible-play warning or cooldown now store the intervention in frontend state and show a persistent acknowledgement banner above the active screen. The banner posts to the backend acknowledgement endpoint, clears only after the backend returns an acknowledgement timestamp, and reports failures through the existing notification surface.

Scope:
- Pending responsible-play intervention state.
- Frontend acknowledgement loading state.
- Required-intervention detection in the shared game-response notifier.
- Persistent player acknowledgement banner.
- Backend acknowledgement API helper usage.

Acceptance criteria:
- Required responsible-play interventions remain visible until acknowledged.
- Acknowledgement calls the backend endpoint.
- Successful acknowledgement clears the banner.
- Failed acknowledgement shows an error notification.
- Local quality gate passes.

### T85 - Enforce Responsible Play Acknowledgement Before New Play

Summary: Block new wagering play while a required responsible-play intervention remains unacknowledged.

Implementation status: Complete. The playable-session guard now checks the latest responsible-play intervention after session-timeout enforcement. If the latest intervention requires acknowledgement and has no `acknowledgedAt` timestamp, new wagering entry points return `403` before creating another round and record a `responsible_play_acknowledgement_required` risk event. The acknowledgement endpoint and non-play account/evidence routes remain available through normal authentication. The memory API smoke verifies blocked play before acknowledgement and admin-visible risk-event logging.

Scope:
- Latest-intervention check inside playable-session guard.
- `403` status mapping for acknowledgement-required play blocks.
- Risk event creation for attempted new play before acknowledgement.
- Memory API smoke coverage for pre-acknowledgement block and risk event.

Acceptance criteria:
- New play is blocked while a required intervention is unacknowledged.
- Acknowledgement endpoint remains available.
- Blocked attempts produce admin-visible risk events.
- Acknowledged interventions allow the guard to proceed.
- Local quality gate passes.

### T86 - High-Value Withdrawal Step-Up Guard

Summary: Require step-up authentication before high-value wallet withdrawals.

Implementation status: Complete. Wallet withdrawals at or above `$1,000` now require a valid `wallet:withdrawal` step-up token before the ledger debit is attempted. Missing or invalid step-up tokens return `403` through the existing step-up guard and record the standard `step_up_required` risk event. The typed wallet withdrawal API helper can pass `X-Step-Up-Token`, and the memory API smoke verifies both the blocked high-value withdrawal and the successful step-up-authorized withdrawal.

Scope:
- Backend high-value withdrawal step-up requirement.
- `wallet:withdrawal` step-up scope.
- Frontend API helper support for withdrawal step-up token headers.
- Memory API smoke coverage for blocked and authorized high-value withdrawals.

Acceptance criteria:
- Withdrawals below `$1,000` keep the existing flow.
- Withdrawals at or above `$1,000` require step-up authentication.
- Missing step-up token returns `403` before debiting the wallet.
- Valid step-up token permits the withdrawal and records the debit.
- Local quality gate passes.

### T87 - High-Value Withdrawal Step-Up UI

Summary: Prompt for step-up credentials in the wallet before submitting high-value withdrawals.

Implementation status: Complete. The wallet panel now shows a step-up password input when the current withdrawal amount is at or above the backend `$1,000` threshold. The withdrawal handler requests a `wallet:withdrawal` step-up token before calling the withdrawal API, passes the token through the typed helper, clears the password after success, and reports missing or failed step-up attempts through the existing notification surface.

Scope:
- Wallet step-up password state.
- Conditional high-value withdrawal password input.
- Frontend step-up token request with `wallet:withdrawal` scope.
- Withdrawal API call updated to include the returned step-up token.
- Error handling for missing or failed step-up credentials.

Acceptance criteria:
- High-value withdrawal UI asks for account password before submission.
- Missing password does not call the withdrawal endpoint.
- Valid password obtains a step-up token and submits the withdrawal.
- Password state clears after successful withdrawal.
- Local quality gate passes.

### T88 - High-Value Withdrawal Compliance Review

Summary: Automatically open a security review case for very large withdrawals.

Implementation status: Complete. First-time withdrawals at or above `$2,500` now open a `security` compliance case with withdrawal reference, method, amount, and idempotency evidence. The review case is created only after the ledger debit succeeds and only for non-replayed idempotent requests, so retries do not duplicate queue work. The system records the standard compliance audit/risk event and sends a mandatory risk notification to the player. The memory API smoke verifies review-case creation, replay safety, and player notification delivery.

Scope:
- Automatic high-value withdrawal review helper.
- Security compliance case creation with withdrawal evidence.
- Compliance audit/risk event for automatic review cases.
- Player risk notification for review queue entry.
- Memory API smoke coverage for case creation, replay count, and notification.

Acceptance criteria:
- Withdrawals below `$2,500` do not create review cases.
- First-time withdrawals at or above `$2,500` create one security case.
- Idempotent replay does not create duplicate cases.
- Player receives a risk notification for the review.
- Local quality gate passes.

### T89 - Surface Withdrawal Review Status In Wallet

Summary: Refresh player notifications and show review-aware success copy after high-value withdrawals.

Implementation status: Complete. Successful wallet withdrawals now refresh the player notification inbox immediately, so the risk notification created for high-value withdrawal review appears without waiting for a manual refresh. The wallet success message now distinguishes normal withdrawals from withdrawals queued for security review at the `$2,500` threshold.

Scope:
- Refresh notifications after successful wallet withdrawals.
- Review-aware wallet withdrawal success message.
- Preserve existing wallet sync and error handling.

Acceptance criteria:
- Successful withdrawals refresh the notification inbox.
- High-value review withdrawals show review-queued success copy.
- Normal withdrawals keep standard success copy.
- Local quality gate passes.

### T90 - Player Compliance Case Visibility

Summary: Let players view their own active security review cases from the wallet.

Implementation status: Complete. A new player-safe `/api/compliance/cases` endpoint returns only the authenticated user's own compliance cases with optional status/type filters. The frontend exposes a typed helper, loads open security cases when the wallet opens and after withdrawals, and renders active review cases in the wallet panel with status, priority, and reference evidence. The memory API smoke verifies that a high-value withdrawal review case is visible through the player endpoint.

Scope:
- Player-owned compliance case API endpoint.
- Typed frontend helper for own compliance cases.
- Wallet loading of open security review cases.
- Wallet UI for active review cases.
- Memory API smoke coverage for player-visible withdrawal review case.

Acceptance criteria:
- Players can fetch only their own compliance cases.
- Wallet shows active security review cases.
- High-value withdrawal review cases appear without admin access.
- Local quality gate passes.

### T91 - Compliance Case Status Notifications

Summary: Notify players when an admin advances or closes one of their compliance review cases.

Implementation status: Complete. Admin compliance case notes now send a player risk notification whenever the note changes case status or records an outcome. The notification includes the case id, case type, current status, outcome, action, and latest evidence so the player-facing wallet/review UI can refresh around concrete review state. The memory API smoke closes the high-value withdrawal review case, verifies it leaves the player's open review queue, verifies the closed queue preserves the approval outcome, and confirms the closure notification is delivered.

Scope:
- Player notification hook for admin compliance status/outcome changes.
- Structured notification metadata for case status transitions.
- Memory API smoke coverage for high-value withdrawal review closure.
- Player open/closed compliance case visibility assertions.

Acceptance criteria:
- Status or outcome changes on admin case notes notify the subject player.
- Closed review cases leave the player's open review queue.
- Closed review cases remain visible with their recorded outcome.
- Local quality gate passes.

### T92 - Player Review Outcome History

Summary: Show recently closed player security reviews in the wallet alongside active review cases.

Implementation status: Complete. The wallet now loads both open and recently closed player-owned security compliance cases. Active cases remain in the warning-style review queue, while recent closed cases render as outcome cards with status, recorded outcome, and withdrawal/reference evidence. This gives the player a visible follow-through after an admin closes a high-value withdrawal review instead of relying only on the notification inbox.

Scope:
- Separate wallet state for recently closed security review cases.
- Parallel player compliance case loading for open and closed queues.
- Wallet UI section for recent review outcomes.
- Outcome/reference display for closed review cases.

Acceptance criteria:
- Wallet continues to show active security review cases.
- Wallet also shows recently closed security review outcomes.
- Closed cards display status, outcome, and reference evidence.
- Local quality gate passes.

### T93 - High-Value Withdrawal Ledger Holds

Summary: Reserve high-value withdrawal funds during security review and settle the hold only after approval.

Implementation status: Complete. Wallet services now expose generic lock, locked-settlement, and locked-release operations in both memory and Prisma drivers. Withdrawals at or above the high-value review threshold now move funds from available to locked with a `pending_review` withdrawal status instead of final-debiting immediately. When the related compliance case is closed with the `approved_for_private_payout` outcome, the backend idempotently settles the locked funds, broadcasts the wallet update, and sends a wallet approval notification. The memory API smoke verifies the hold, replay stability, approval settlement, and reference-linked ledger entries.

Scope:
- Memory wallet lock/settle/release service methods.
- Prisma wallet lock/settle/release service methods.
- High-value withdrawal hold behavior and `pending_review` response status.
- Compliance approval settlement for held withdrawal funds.
- Smoke coverage for locked funds and settlement ledger entries.

Acceptance criteria:
- High-value withdrawal review funds are locked while review is open.
- Idempotent withdrawal replay does not duplicate or change the hold.
- Approved review closure settles the held amount exactly once.
- Ledger entries preserve withdrawal reference and compliance case evidence.
- Local quality gate passes.

### T94 - Rejected Withdrawal Hold Release

Summary: Return locked withdrawal funds when a high-value payout review is rejected.

Implementation status: Complete. Compliance case closure now resolves high-value withdrawal holds in both directions: `approved_for_private_payout` settles the locked amount, while `rejected_private_payout` releases the locked amount back to the player's available wallet balance. The release path is idempotent, broadcasts the updated wallet, and sends a wallet notification explaining that the held funds were returned. The memory API smoke covers a second high-value withdrawal that is rejected, verifies the locked funds return to available balance, and asserts the release ledger entry is linked to the withdrawal reference and compliance case.

Scope:
- Shared withdrawal hold resolution helper.
- Rejected withdrawal review release behavior.
- Player wallet notification for released withdrawal holds.
- Memory API smoke coverage for rejected review release.
- Ledger evidence linking release entries to review case and withdrawal reference.

Acceptance criteria:
- Rejected high-value withdrawal reviews release locked funds.
- Released funds return to available balance and clear locked balance.
- Release ledger entry is tied to the compliance case and withdrawal reference.
- Player receives a wallet notification for the release.
- Local quality gate passes.

### T95 - Prisma Withdrawal Review Smoke Coverage

Summary: Prove high-value withdrawal hold approval and rejection flows against the persistent Prisma API driver.

Implementation status: Complete. The Prisma API smoke now covers the high-value withdrawal lifecycle added in the memory smoke. It verifies step-up blocking, step-up authorization, review-case creation, `pending_review` response status, locked funds during review, approved payout settlement, rejected payout release, and persisted ledger evidence for both `settleLoss` and `release` entries linked to their compliance cases and withdrawal references.

Scope:
- Prisma API smoke step-up requirement for high-value withdrawals.
- Persistent review-case lookup for approved and rejected withdrawals.
- Persistent wallet locked-balance assertions.
- Persistent settlement and release ledger evidence assertions.

Acceptance criteria:
- Prisma API smoke fails if high-value withdrawals bypass step-up.
- Prisma API smoke fails if approved reviews do not settle held funds.
- Prisma API smoke fails if rejected reviews do not release held funds.
- Prisma API smoke verifies compliance-case-linked settlement and release ledger entries.
- Local quality gate passes.

### T96 - Immutable Closed Compliance Outcomes

Summary: Prevent closed compliance cases from changing status or outcome after resolution.

Implementation status: Complete. Compliance case services now reject status or outcome changes once a case is closed, while still allowing plain follow-up notes without status/outcome mutations. The guard lives in both memory and Prisma service implementations so admin APIs and future service callers share the same invariant. The memory API smoke attempts to rewrite an approved withdrawal review into a rejected payout, expects a `400`, and verifies the wallet remains settled with no funds re-locked or released.

Scope:
- Closed-case resolution guard in memory compliance case service.
- Closed-case resolution guard in Prisma compliance case service.
- Smoke coverage for blocked withdrawal review outcome rewrite.
- Wallet stability assertions after blocked rewrite.

Acceptance criteria:
- Closed compliance cases cannot change status or outcome.
- Plain notes on closed cases remain possible.
- Blocked review rewrites do not mutate wallet balances.
- Local quality gate passes.

### T97 - Reconciliation Support For Withdrawal Holds

Summary: Treat pending high-value withdrawal holds as valid locked wallet funds in integrity reconciliation.

Implementation status: Complete. Reconciliation now computes unresolved withdrawal holds from ledger entries tagged with `withdrawal_hold` and subtracts holds that were later settled or released through review resolution entries. Wallet locked-balance checks now compare locked funds against open round stake plus unresolved withdrawal holds, preventing false critical failures while payout reviews are pending. Unit coverage verifies clean pending holds pass reconciliation and resolved holds no longer count as locked funds.

Scope:
- Reconciliation unresolved withdrawal hold calculation.
- Locked-balance expected value updated for open rounds plus pending payout holds.
- Unit coverage for pending withdrawal holds.
- Unit coverage for settled withdrawal holds.

Acceptance criteria:
- Pending high-value withdrawal holds do not fail reconciliation.
- Settled or released withdrawal holds do not remain counted as locked funds.
- Existing open-round locked-balance checks remain active.
- Local quality gate passes.

### T98 - Dedicated Withdrawal Records

Summary: Add first-class withdrawal records separate from the wallet ledger.

Implementation status: Complete. The platform now stores operational withdrawal records in memory and Prisma modes while keeping wallet ledger entries as the source of money truth. A new withdrawal service creates idempotent withdrawal records, links high-value withdrawal records to their compliance review case, and resolves them as `approved` or `rejected` when review closure settles or releases held funds. Prisma schema and migration support persistent `withdrawal_records`, and a player-safe `/api/wallet/withdrawals` endpoint lists the authenticated user's withdrawal records with optional status filtering. Memory API smoke verifies pending, approved, and rejected withdrawal records, compliance-case links, and resolution timestamps.

Scope:
- `withdrawal_records` Prisma model and migration.
- Memory and Prisma withdrawal service implementations.
- Wallet withdrawal route creates operational records.
- Review case linkage and approval/rejection status updates.
- Player-safe withdrawal record list endpoint and typed API helper.
- Smoke coverage for pending, approved, and rejected withdrawal records.

Acceptance criteria:
- Every withdrawal creates a first-class withdrawal record.
- High-value pending withdrawals link to their compliance case.
- Approved and rejected review closures update withdrawal status.
- Players can list only their own withdrawal records.
- Local quality gate passes.

## First Working Sequence

Start here:

1. T00.1 - Dependency and script cleanup
2. T00.2 - TypeScript compile gate
3. T00.3 - Copy and compliance language cleanup
4. T00.5 - Current architecture notes
5. T01 - App shell and repo setup

Reason: the current app already has useful UX and game prototypes, but production work should start by making the prototype runnable, truthful, documented, and testable before introducing a database or wallet ledger.
