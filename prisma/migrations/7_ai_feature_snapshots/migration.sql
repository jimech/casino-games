CREATE TABLE "ai_feature_snapshots" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "sourceEventCount" INTEGER NOT NULL DEFAULT 0,
  "features" JSONB NOT NULL,
  "windowStartedAt" TIMESTAMP(3),
  "windowEndedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_feature_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_feature_snapshots_userId_createdAt_idx" ON "ai_feature_snapshots"("userId", "createdAt");
CREATE INDEX "ai_feature_snapshots_userId_version_createdAt_idx" ON "ai_feature_snapshots"("userId", "version", "createdAt");

ALTER TABLE "ai_feature_snapshots" ADD CONSTRAINT "ai_feature_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feature_snapshots" ENABLE ROW LEVEL SECURITY;
