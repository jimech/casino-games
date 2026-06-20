CREATE TABLE "ai_decision_explanations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "decisionType" TEXT NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "sourceRecordId" TEXT,
  "sourceFeatureSnapshotId" TEXT,
  "sourceFeatureVersion" TEXT,
  "inputFeatures" JSONB,
  "output" JSONB,
  "threshold" JSONB,
  "reasonCodes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_decision_explanations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_decision_explanations_userId_createdAt_idx" ON "ai_decision_explanations"("userId", "createdAt");
CREATE INDEX "ai_decision_explanations_decisionType_createdAt_idx" ON "ai_decision_explanations"("decisionType", "createdAt");

ALTER TABLE "ai_decision_explanations" ADD CONSTRAINT "ai_decision_explanations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_decision_explanations" ENABLE ROW LEVEL SECURITY;
