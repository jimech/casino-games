CREATE TABLE "ai_model_controls" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "modelKey" TEXT NOT NULL,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_model_controls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_model_controls_modelKey_key" ON "ai_model_controls"("modelKey");
CREATE INDEX "ai_model_controls_disabled_updatedAt_idx" ON "ai_model_controls"("disabled", "updatedAt");

ALTER TABLE "ai_model_controls" ADD CONSTRAINT "ai_model_controls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_model_controls" ENABLE ROW LEVEL SECURITY;
