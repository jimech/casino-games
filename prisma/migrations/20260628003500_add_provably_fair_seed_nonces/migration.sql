-- CreateTable
CREATE TABLE "provably_fair_seed_nonces" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "nextNonce" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provably_fair_seed_nonces_pkey" PRIMARY KEY ("id")
);

-- Backfill next nonce counters from existing committed/revealed seeds.
INSERT INTO "provably_fair_seed_nonces" ("id", "userId", "gameId", "nextNonce", "createdAt", "updatedAt")
SELECT
    'pf_nonce_' || md5("userId" || ':' || "gameId"),
    "userId",
    "gameId",
    MAX("nonce") + 1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "provably_fair_seeds"
GROUP BY "userId", "gameId";

-- CreateIndex
CREATE UNIQUE INDEX "provably_fair_seed_nonces_userId_gameId_key" ON "provably_fair_seed_nonces"("userId", "gameId");

-- CreateIndex
CREATE INDEX "provably_fair_seed_nonces_gameId_idx" ON "provably_fair_seed_nonces"("gameId");

-- AddForeignKey
ALTER TABLE "provably_fair_seed_nonces" ADD CONSTRAINT "provably_fair_seed_nonces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
