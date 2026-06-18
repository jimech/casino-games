CREATE TYPE "RiskSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "RiskEventStatus" AS ENUM ('open', 'reviewed', 'dismissed');

CREATE TABLE "risk_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "severity" "RiskSeverity" NOT NULL,
  "status" "RiskEventStatus" NOT NULL DEFAULT 'open',
  "score" INTEGER NOT NULL DEFAULT 0,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),

  CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "risk_events_userId_createdAt_idx" ON "risk_events"("userId", "createdAt");
CREATE INDEX "risk_events_status_severity_createdAt_idx" ON "risk_events"("status", "severity", "createdAt");

ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "risk_events" ENABLE ROW LEVEL SECURITY;
