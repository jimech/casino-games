-- CreateTable
CREATE TABLE "idempotency_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_requests_userId_scope_idempotencyKey_key" ON "idempotency_requests"("userId", "scope", "idempotencyKey");

-- CreateIndex
CREATE INDEX "idempotency_requests_userId_createdAt_idx" ON "idempotency_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "idempotency_requests_scope_createdAt_idx" ON "idempotency_requests"("scope", "createdAt");

-- AddForeignKey
ALTER TABLE "idempotency_requests" ADD CONSTRAINT "idempotency_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
