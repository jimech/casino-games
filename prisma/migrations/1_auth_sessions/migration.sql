ALTER TABLE "users"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "ageGateAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "privacyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userAgent" TEXT,
  "ipAddress" TEXT,

  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");
CREATE INDEX "auth_sessions_userId_expiresAt_idx" ON "auth_sessions"("userId", "expiresAt");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;
