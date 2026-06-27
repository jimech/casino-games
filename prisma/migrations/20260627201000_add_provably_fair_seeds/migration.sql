-- CreateEnum
CREATE TYPE "ProvablyFairSeedStatus" AS ENUM ('committed', 'revealed');

-- CreateTable
CREATE TABLE "provably_fair_seeds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "serverSeed" TEXT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "status" "ProvablyFairSeedStatus" NOT NULL DEFAULT 'committed',
    "commitmentKey" TEXT NOT NULL,
    "roundId" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "provably_fair_seeds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provably_fair_seeds_commitmentKey_key" ON "provably_fair_seeds"("commitmentKey");

-- CreateIndex
CREATE UNIQUE INDEX "provably_fair_seeds_userId_gameId_nonce_key" ON "provably_fair_seeds"("userId", "gameId", "nonce");

-- CreateIndex
CREATE INDEX "provably_fair_seeds_userId_committedAt_idx" ON "provably_fair_seeds"("userId", "committedAt");

-- CreateIndex
CREATE INDEX "provably_fair_seeds_gameId_committedAt_idx" ON "provably_fair_seeds"("gameId", "committedAt");

-- CreateIndex
CREATE INDEX "provably_fair_seeds_status_idx" ON "provably_fair_seeds"("status");

-- CreateIndex
CREATE INDEX "provably_fair_seeds_roundId_idx" ON "provably_fair_seeds"("roundId");

-- AddForeignKey
ALTER TABLE "provably_fair_seeds" ADD CONSTRAINT "provably_fair_seeds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provably_fair_seeds" ADD CONSTRAINT "provably_fair_seeds_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "game_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
