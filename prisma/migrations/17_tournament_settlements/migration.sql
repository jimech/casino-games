CREATE TABLE "tournament_settlements" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "prizePool" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'settled',
  "idempotencyKey" TEXT NOT NULL,
  "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tournament_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournament_payouts" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "amount" BIGINT NOT NULL,
  "ledgerEntryId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tournament_payouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_settlements_tournamentId_key" ON "tournament_settlements"("tournamentId");
CREATE UNIQUE INDEX "tournament_settlements_idempotencyKey_key" ON "tournament_settlements"("idempotencyKey");
CREATE INDEX "tournament_settlements_settledAt_idx" ON "tournament_settlements"("settledAt");

CREATE UNIQUE INDEX "tournament_payouts_idempotencyKey_key" ON "tournament_payouts"("idempotencyKey");
CREATE UNIQUE INDEX "tournament_payouts_tournamentId_rank_key" ON "tournament_payouts"("tournamentId", "rank");
CREATE INDEX "tournament_payouts_userId_createdAt_idx" ON "tournament_payouts"("userId", "createdAt");
CREATE INDEX "tournament_payouts_tournamentId_rank_idx" ON "tournament_payouts"("tournamentId", "rank");

ALTER TABLE "tournament_payouts"
  ADD CONSTRAINT "tournament_payouts_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "tournament_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_payouts"
  ADD CONSTRAINT "tournament_payouts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
