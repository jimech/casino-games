CREATE TABLE "responsible_play_interventions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reasonCodes" TEXT[] NOT NULL,
  "recommendedActions" TEXT[] NOT NULL,
  "message" TEXT NOT NULL,
  "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
  "triggerGameId" TEXT,
  "triggerStake" BIGINT,
  "sourceFeatureSnapshotId" TEXT,
  "sourceFeatureVersion" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "responsible_play_interventions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "responsible_play_interventions_userId_createdAt_idx" ON "responsible_play_interventions"("userId", "createdAt");
CREATE INDEX "responsible_play_interventions_level_score_createdAt_idx" ON "responsible_play_interventions"("level", "score", "createdAt");

ALTER TABLE "responsible_play_interventions" ADD CONSTRAINT "responsible_play_interventions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "responsible_play_interventions" ENABLE ROW LEVEL SECURITY;
