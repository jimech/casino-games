CREATE TABLE "fraud_scores" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "band" TEXT NOT NULL,
  "reasonCodes" TEXT[] NOT NULL,
  "recommendedActions" TEXT[] NOT NULL,
  "sourceFeatureSnapshotId" TEXT,
  "sourceFeatureVersion" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fraud_scores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fraud_scores_userId_createdAt_idx" ON "fraud_scores"("userId", "createdAt");
CREATE INDEX "fraud_scores_band_score_createdAt_idx" ON "fraud_scores"("band", "score", "createdAt");

ALTER TABLE "fraud_scores" ADD CONSTRAINT "fraud_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fraud_scores" ENABLE ROW LEVEL SECURITY;
