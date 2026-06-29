import { Prisma, PrismaClient } from '@prisma/client';

export type ComplianceCaseStatus = 'open' | 'in_review' | 'closed';
export type ComplianceCasePriority = 'low' | 'medium' | 'high' | 'critical';
export type ComplianceCaseType = 'fraud' | 'responsible_play' | 'security' | 'retention' | 'general';

export interface ComplianceCaseNoteRecord {
  id: string;
  caseId: string;
  authorId: string;
  note: string;
  action: string;
  status?: ComplianceCaseStatus;
  outcome?: string;
  evidence?: Record<string, unknown>;
  createdAt: string;
}

export interface ComplianceCaseRecord {
  id: string;
  subjectUserId: string;
  type: ComplianceCaseType;
  status: ComplianceCaseStatus;
  priority: ComplianceCasePriority;
  title: string;
  description?: string;
  evidence?: Record<string, unknown>;
  assignedToUserId?: string;
  outcome?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  notes: ComplianceCaseNoteRecord[];
}

export interface ComplianceCaseService {
  create(input: {
    subjectUserId: string;
    type: ComplianceCaseType;
    priority?: ComplianceCasePriority;
    title: string;
    description?: string;
    evidence?: Record<string, unknown>;
    assignedToUserId?: string;
    authorId: string;
  }): Promise<ComplianceCaseRecord> | ComplianceCaseRecord;
  list(input?: {
    subjectUserId?: string;
    status?: ComplianceCaseStatus;
    type?: ComplianceCaseType;
    limit?: number;
  }): Promise<ComplianceCaseRecord[]> | ComplianceCaseRecord[];
  get(input: { caseId: string }): Promise<ComplianceCaseRecord | undefined> | ComplianceCaseRecord | undefined;
  addNote(input: {
    caseId: string;
    authorId: string;
    note: string;
    action?: string;
    status?: ComplianceCaseStatus;
    assignedToUserId?: string;
    outcome?: string;
    evidence?: Record<string, unknown>;
  }): Promise<ComplianceCaseRecord> | ComplianceCaseRecord;
}

export class MemoryComplianceCaseService implements ComplianceCaseService {
  private cases: ComplianceCaseRecord[] = [];
  private caseSequence = 0;
  private noteSequence = 0;

  create(input: {
    subjectUserId: string;
    type: ComplianceCaseType;
    priority?: ComplianceCasePriority;
    title: string;
    description?: string;
    evidence?: Record<string, unknown>;
    assignedToUserId?: string;
    authorId: string;
  }): ComplianceCaseRecord {
    validateCaseCreate(input);
    const now = new Date().toISOString();
    const caseRecord: ComplianceCaseRecord = {
      id: `case_${(++this.caseSequence).toString().padStart(8, '0')}`,
      subjectUserId: input.subjectUserId,
      type: input.type,
      status: 'open',
      priority: input.priority ?? 'medium',
      title: input.title.trim(),
      description: cleanOptionalText(input.description),
      evidence: input.evidence,
      assignedToUserId: input.assignedToUserId,
      createdAt: now,
      updatedAt: now,
      notes: [{
        id: `case_note_${(++this.noteSequence).toString().padStart(8, '0')}`,
        caseId: `case_${this.caseSequence.toString().padStart(8, '0')}`,
        authorId: input.authorId,
        note: 'Case opened',
        action: 'created',
        status: 'open',
        evidence: input.evidence,
        createdAt: now
      }]
    };
    this.cases.unshift(caseRecord);
    return cloneCase(caseRecord);
  }

  list(input: { subjectUserId?: string; status?: ComplianceCaseStatus; type?: ComplianceCaseType; limit?: number } = {}): ComplianceCaseRecord[] {
    return this.cases
      .filter(caseRecord => !input.subjectUserId || caseRecord.subjectUserId === input.subjectUserId)
      .filter(caseRecord => !input.status || caseRecord.status === input.status)
      .filter(caseRecord => !input.type || caseRecord.type === input.type)
      .slice(0, normalizeLimit(input.limit))
      .map(cloneCase);
  }

  get(input: { caseId: string }): ComplianceCaseRecord | undefined {
    assertText(input.caseId, 'caseId');
    const caseRecord = this.cases.find(item => item.id === input.caseId);
    return caseRecord ? cloneCase(caseRecord) : undefined;
  }

  addNote(input: {
    caseId: string;
    authorId: string;
    note: string;
    action?: string;
    status?: ComplianceCaseStatus;
    assignedToUserId?: string;
    outcome?: string;
    evidence?: Record<string, unknown>;
  }): ComplianceCaseRecord {
    validateNoteInput(input);
    const caseRecord = this.cases.find(item => item.id === input.caseId);
    if (!caseRecord) throw new Error(`Compliance case not found: ${input.caseId}`);
    assertCaseResolutionMutable(caseRecord, input);
    const now = new Date().toISOString();
    if (input.status) {
      caseRecord.status = input.status;
      caseRecord.closedAt = input.status === 'closed' ? now : undefined;
    }
    if (input.assignedToUserId) caseRecord.assignedToUserId = input.assignedToUserId;
    if (input.outcome) caseRecord.outcome = input.outcome;
    caseRecord.updatedAt = now;
    caseRecord.notes.unshift({
      id: `case_note_${(++this.noteSequence).toString().padStart(8, '0')}`,
      caseId: input.caseId,
      authorId: input.authorId,
      note: input.note.trim(),
      action: input.action ?? 'note_added',
      status: input.status,
      outcome: input.outcome,
      evidence: input.evidence,
      createdAt: now
    });
    return cloneCase(caseRecord);
  }
}

export class PrismaComplianceCaseService implements ComplianceCaseService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    subjectUserId: string;
    type: ComplianceCaseType;
    priority?: ComplianceCasePriority;
    title: string;
    description?: string;
    evidence?: Record<string, unknown>;
    assignedToUserId?: string;
    authorId: string;
  }): Promise<ComplianceCaseRecord> {
    validateCaseCreate(input);
    const created = await this.prisma.complianceCase.create({
      data: {
        subjectUserId: input.subjectUserId,
        type: input.type,
        priority: input.priority ?? 'medium',
        title: input.title.trim(),
        description: cleanOptionalText(input.description),
        evidence: input.evidence as Prisma.InputJsonObject | undefined,
        assignedToUserId: input.assignedToUserId,
        notes: {
          create: {
            authorId: input.authorId,
            note: 'Case opened',
            action: 'created',
            status: 'open',
            evidence: input.evidence as Prisma.InputJsonObject | undefined
          }
        }
      },
      include: { notes: { orderBy: { createdAt: 'desc' } } }
    });
    return complianceCaseToRecord(created);
  }

  async list(input: { subjectUserId?: string; status?: ComplianceCaseStatus; type?: ComplianceCaseType; limit?: number } = {}): Promise<ComplianceCaseRecord[]> {
    const cases = await this.prisma.complianceCase.findMany({
      where: {
        subjectUserId: input.subjectUserId,
        status: input.status,
        type: input.type
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(input.limit),
      include: { notes: { orderBy: { createdAt: 'desc' } } }
    });
    return cases.map(complianceCaseToRecord);
  }

  async get(input: { caseId: string }): Promise<ComplianceCaseRecord | undefined> {
    assertText(input.caseId, 'caseId');
    const caseRecord = await this.prisma.complianceCase.findUnique({
      where: { id: input.caseId },
      include: { notes: { orderBy: { createdAt: 'desc' } } }
    });
    return caseRecord ? complianceCaseToRecord(caseRecord) : undefined;
  }

  async addNote(input: {
    caseId: string;
    authorId: string;
    note: string;
    action?: string;
    status?: ComplianceCaseStatus;
    assignedToUserId?: string;
    outcome?: string;
    evidence?: Record<string, unknown>;
  }): Promise<ComplianceCaseRecord> {
    validateNoteInput(input);
    const existing = await this.prisma.complianceCase.findUnique({ where: { id: input.caseId } });
    if (!existing) throw new Error(`Compliance case not found: ${input.caseId}`);
    assertCaseResolutionMutable(complianceCaseToRecord({ ...existing, notes: [] }), input);
    const now = new Date();
    const updated = await this.prisma.complianceCase.update({
      where: { id: input.caseId },
      data: {
        status: input.status,
        assignedToUserId: input.assignedToUserId,
        outcome: input.outcome,
        closedAt: input.status === 'closed' ? now : undefined,
        notes: {
          create: {
            authorId: input.authorId,
            note: input.note.trim(),
            action: input.action ?? 'note_added',
            status: input.status,
            outcome: input.outcome,
            evidence: input.evidence as Prisma.InputJsonObject | undefined
          }
        }
      },
      include: { notes: { orderBy: { createdAt: 'desc' } } }
    });
    return complianceCaseToRecord(updated);
  }
}

const validateCaseCreate = (input: {
  subjectUserId: string;
  type: ComplianceCaseType;
  title: string;
  authorId: string;
}) => {
  assertText(input.subjectUserId, 'subjectUserId');
  assertText(input.authorId, 'authorId');
  assertText(input.title, 'title');
  if (!isComplianceCaseType(input.type)) throw new Error('Invalid compliance case type');
};

const validateNoteInput = (input: { caseId: string; authorId: string; note: string; status?: ComplianceCaseStatus }) => {
  assertText(input.caseId, 'caseId');
  assertText(input.authorId, 'authorId');
  assertText(input.note, 'note');
  if (input.status && !isComplianceCaseStatus(input.status)) throw new Error('Invalid compliance case status');
};

const assertCaseResolutionMutable = (
  caseRecord: { status: ComplianceCaseStatus; outcome?: string },
  input: { status?: ComplianceCaseStatus; outcome?: string }
) => {
  if (caseRecord.status !== 'closed') return;
  if (!input.status && !input.outcome) return;
  throw new Error('Compliance case is already closed and cannot change status or outcome');
};

export const isComplianceCaseType = (value: unknown): value is ComplianceCaseType =>
  value === 'fraud' || value === 'responsible_play' || value === 'security' || value === 'retention' || value === 'general';

export const isComplianceCaseStatus = (value: unknown): value is ComplianceCaseStatus =>
  value === 'open' || value === 'in_review' || value === 'closed';

export const isComplianceCasePriority = (value: unknown): value is ComplianceCasePriority =>
  value === 'low' || value === 'medium' || value === 'high' || value === 'critical';

const normalizeLimit = (limit?: number) => {
  if (!Number.isFinite(limit ?? 50)) return 50;
  return Math.max(1, Math.min(250, Math.floor(limit ?? 50)));
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const cleanOptionalText = (value: string | undefined) => {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 1000) : undefined;
};

const cloneCase = (caseRecord: ComplianceCaseRecord): ComplianceCaseRecord => ({
  ...caseRecord,
  evidence: caseRecord.evidence ? { ...caseRecord.evidence } : undefined,
  notes: caseRecord.notes.map(note => ({
    ...note,
    evidence: note.evidence ? { ...note.evidence } : undefined
  }))
});

const complianceCaseToRecord = (caseRecord: {
  id: string;
  subjectUserId: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  description: string | null;
  evidence: Prisma.JsonValue | null;
  assignedToUserId: string | null;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  notes: Array<{
    id: string;
    caseId: string;
    authorId: string;
    note: string;
    action: string;
    status: string | null;
    outcome: string | null;
    evidence: Prisma.JsonValue | null;
    createdAt: Date;
  }>;
}): ComplianceCaseRecord => ({
  id: caseRecord.id,
  subjectUserId: caseRecord.subjectUserId,
  type: caseRecord.type as ComplianceCaseType,
  status: caseRecord.status as ComplianceCaseStatus,
  priority: caseRecord.priority as ComplianceCasePriority,
  title: caseRecord.title,
  description: caseRecord.description ?? undefined,
  evidence: isRecord(caseRecord.evidence) ? caseRecord.evidence : undefined,
  assignedToUserId: caseRecord.assignedToUserId ?? undefined,
  outcome: caseRecord.outcome ?? undefined,
  createdAt: caseRecord.createdAt.toISOString(),
  updatedAt: caseRecord.updatedAt.toISOString(),
  closedAt: caseRecord.closedAt?.toISOString(),
  notes: caseRecord.notes.map(note => ({
    id: note.id,
    caseId: note.caseId,
    authorId: note.authorId,
    note: note.note,
    action: note.action,
    status: note.status as ComplianceCaseStatus | undefined,
    outcome: note.outcome ?? undefined,
    evidence: isRecord(note.evidence) ? note.evidence : undefined,
    createdAt: note.createdAt.toISOString()
  }))
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
