CREATE TABLE "tournament_entries" (
  "id" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "entryFee" BIGINT NOT NULL,
  "ledgerEntryId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_entries_idempotencyKey_key" ON "tournament_entries"("idempotencyKey");
CREATE UNIQUE INDEX "tournament_entries_tournamentId_userId_key" ON "tournament_entries"("tournamentId", "userId");
CREATE INDEX "tournament_entries_userId_enteredAt_idx" ON "tournament_entries"("userId", "enteredAt");
CREATE INDEX "tournament_entries_tournamentId_enteredAt_idx" ON "tournament_entries"("tournamentId", "enteredAt");

ALTER TABLE "tournament_entries"
  ADD CONSTRAINT "tournament_entries_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
