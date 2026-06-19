CREATE TYPE "BonusCampaignType" AS ENUM ('welcome', 'daily', 'cashback', 'freeSpins');
CREATE TYPE "BonusClaimStatus" AS ENUM ('claimed', 'rejected');

CREATE TABLE "bonus_campaigns" (
  "id" TEXT NOT NULL,
  "type" "BonusCampaignType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "amount" BIGINT NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "bonus_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bonus_claims" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "status" "BonusClaimStatus" NOT NULL DEFAULT 'claimed',
  "claimKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "ledgerEntryId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bonus_claims_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bonus_campaigns_active_type_idx" ON "bonus_campaigns"("active", "type");
CREATE UNIQUE INDEX "bonus_claims_idempotencyKey_key" ON "bonus_claims"("idempotencyKey");
CREATE UNIQUE INDEX "bonus_claims_userId_campaignId_claimKey_key" ON "bonus_claims"("userId", "campaignId", "claimKey");
CREATE INDEX "bonus_claims_userId_createdAt_idx" ON "bonus_claims"("userId", "createdAt");

ALTER TABLE "bonus_claims" ADD CONSTRAINT "bonus_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bonus_claims" ADD CONSTRAINT "bonus_claims_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "bonus_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bonus_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bonus_claims" ENABLE ROW LEVEL SECURITY;
