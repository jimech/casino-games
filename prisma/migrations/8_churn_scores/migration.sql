CREATE TABLE "churn_scores" (
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

  CONSTRAINT "churn_scores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "churn_scores_userId_createdAt_idx" ON "churn_scores"("userId", "createdAt");
CREATE INDEX "churn_scores_band_score_createdAt_idx" ON "churn_scores"("band", "score", "createdAt");

ALTER TABLE "churn_scores" ADD CONSTRAINT "churn_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "churn_scores" ENABLE ROW LEVEL SECURITY;
