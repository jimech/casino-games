CREATE TABLE "withdrawal_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "complianceCaseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "withdrawal_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "withdrawal_records_reference_key" ON "withdrawal_records"("reference");
CREATE UNIQUE INDEX "withdrawal_records_idempotencyKey_key" ON "withdrawal_records"("idempotencyKey");
CREATE INDEX "withdrawal_records_userId_createdAt_idx" ON "withdrawal_records"("userId", "createdAt");
CREATE INDEX "withdrawal_records_status_createdAt_idx" ON "withdrawal_records"("status", "createdAt");
CREATE INDEX "withdrawal_records_complianceCaseId_idx" ON "withdrawal_records"("complianceCaseId");

ALTER TABLE "withdrawal_records"
  ADD CONSTRAINT "withdrawal_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "withdrawal_records"
  ADD CONSTRAINT "withdrawal_records_complianceCaseId_fkey"
  FOREIGN KEY ("complianceCaseId") REFERENCES "compliance_cases"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "withdrawal_records" ENABLE ROW LEVEL SECURITY;
