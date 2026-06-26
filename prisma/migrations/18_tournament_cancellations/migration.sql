CREATE TABLE "tournament_cancellations" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tournament_cancellations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tournament_refunds" (
  "id" TEXT NOT NULL,
  "cancellationId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "ledgerEntryId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tournament_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_cancellations_tournamentId_key" ON "tournament_cancellations"("tournamentId");
CREATE UNIQUE INDEX "tournament_cancellations_idempotencyKey_key" ON "tournament_cancellations"("idempotencyKey");
CREATE INDEX "tournament_cancellations_cancelledAt_idx" ON "tournament_cancellations"("cancelledAt");

CREATE UNIQUE INDEX "tournament_refunds_idempotencyKey_key" ON "tournament_refunds"("idempotencyKey");
CREATE UNIQUE INDEX "tournament_refunds_entryId_key" ON "tournament_refunds"("entryId");
CREATE UNIQUE INDEX "tournament_refunds_tournamentId_entryId_key" ON "tournament_refunds"("tournamentId", "entryId");
CREATE INDEX "tournament_refunds_userId_createdAt_idx" ON "tournament_refunds"("userId", "createdAt");
CREATE INDEX "tournament_refunds_tournamentId_createdAt_idx" ON "tournament_refunds"("tournamentId", "createdAt");

ALTER TABLE "tournament_refunds"
  ADD CONSTRAINT "tournament_refunds_cancellationId_fkey"
  FOREIGN KEY ("cancellationId") REFERENCES "tournament_cancellations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_refunds"
  ADD CONSTRAINT "tournament_refunds_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "tournament_entries"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_refunds"
  ADD CONSTRAINT "tournament_refunds_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
