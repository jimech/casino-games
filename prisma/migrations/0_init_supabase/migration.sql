-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('credit', 'debit', 'lock', 'release', 'settleLoss', 'settleWin', 'refund');

-- CreateEnum
CREATE TYPE "GameRoundStatus" AS ENUM ('open', 'settled', 'refunded');

-- CreateEnum
CREATE TYPE "GameRoundEventType" AS ENUM ('started', 'action', 'outcome', 'settled', 'refunded');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "available" BIGINT NOT NULL DEFAULT 0,
    "locked" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_ledger_entries" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balanceBefore" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "lockedBefore" BIGINT NOT NULL,
    "lockedAfter" BIGINT NOT NULL,
    "gameId" TEXT,
    "roundId" TEXT,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rounds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stake" BIGINT NOT NULL,
    "status" "GameRoundStatus" NOT NULL DEFAULT 'open',
    "payout" BIGINT NOT NULL DEFAULT 0,
    "outcome" JSONB,
    "lockIdempotencyKey" TEXT NOT NULL,
    "settlementIdempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_round_events" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "type" "GameRoundEventType" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_round_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_entries_transactionId_key" ON "wallet_ledger_entries"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_ledger_entries_idempotencyKey_key" ON "wallet_ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_userId_createdAt_idx" ON "wallet_ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_walletId_createdAt_idx" ON "wallet_ledger_entries"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_roundId_idx" ON "wallet_ledger_entries"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_lockIdempotencyKey_key" ON "game_rounds"("lockIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "game_rounds_settlementIdempotencyKey_key" ON "game_rounds"("settlementIdempotencyKey");

-- CreateIndex
CREATE INDEX "game_rounds_userId_createdAt_idx" ON "game_rounds"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "game_rounds_gameId_createdAt_idx" ON "game_rounds"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "game_rounds_status_idx" ON "game_rounds"("status");

-- CreateIndex
CREATE INDEX "game_round_events_roundId_createdAt_idx" ON "game_round_events"("roundId", "createdAt");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "game_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_round_events" ADD CONSTRAINT "game_round_events_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "game_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supabase safety: public schema tables can be exposed through the Data API.
-- The backend uses a dedicated Prisma role, so no anon/authenticated policies are added here.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wallet_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "game_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "game_round_events" ENABLE ROW LEVEL SECURITY;
