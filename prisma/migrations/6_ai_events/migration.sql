CREATE TYPE "AiEventCategory" AS ENUM ('page', 'game', 'wallet', 'bonus', 'risk', 'admin', 'session');

CREATE TABLE "ai_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "AiEventCategory" NOT NULL,
  "name" TEXT NOT NULL,
  "context" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_events_userId_createdAt_idx" ON "ai_events"("userId", "createdAt");
CREATE INDEX "ai_events_category_createdAt_idx" ON "ai_events"("category", "createdAt");

ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_events" ENABLE ROW LEVEL SECURITY;
