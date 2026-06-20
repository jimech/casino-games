CREATE TABLE "compliance_cases" (
  "id" TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'medium',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "evidence" JSONB,
  "assignedToUserId" TEXT,
  "outcome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),

  CONSTRAINT "compliance_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compliance_case_notes" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT,
  "outcome" TEXT,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "compliance_case_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "compliance_cases_subjectUserId_createdAt_idx" ON "compliance_cases"("subjectUserId", "createdAt");
CREATE INDEX "compliance_cases_status_priority_createdAt_idx" ON "compliance_cases"("status", "priority", "createdAt");
CREATE INDEX "compliance_cases_type_createdAt_idx" ON "compliance_cases"("type", "createdAt");
CREATE INDEX "compliance_case_notes_caseId_createdAt_idx" ON "compliance_case_notes"("caseId", "createdAt");
CREATE INDEX "compliance_case_notes_authorId_createdAt_idx" ON "compliance_case_notes"("authorId", "createdAt");

ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_case_notes" ADD CONSTRAINT "compliance_case_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "compliance_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "compliance_case_notes" ADD CONSTRAINT "compliance_case_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "compliance_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance_case_notes" ENABLE ROW LEVEL SECURITY;
