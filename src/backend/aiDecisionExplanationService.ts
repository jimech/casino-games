import { Prisma, PrismaClient } from '@prisma/client';

export interface AiDecisionExplanationRecord {
  id: string;
  userId: string;
  decisionType: string;
  modelVersion: string;
  sourceRecordId?: string;
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  inputFeatures?: Record<string, unknown>;
  output?: Record<string, unknown>;
  threshold?: Record<string, unknown>;
  reasonCodes: string[];
  createdAt: string;
}

export interface RecordAiDecisionExplanationInput {
  userId: string;
  decisionType: string;
  modelVersion: string;
  sourceRecordId?: string;
  sourceFeatureSnapshotId?: string;
  sourceFeatureVersion?: string;
  inputFeatures?: Record<string, unknown>;
  output?: Record<string, unknown>;
  threshold?: Record<string, unknown>;
  reasonCodes?: string[];
}

export interface AiDecisionExplanationService {
  record(input: RecordAiDecisionExplanationInput): Promise<AiDecisionExplanationRecord> | AiDecisionExplanationRecord;
  list(input?: { userId?: string; decisionType?: string; limit?: number }): Promise<AiDecisionExplanationRecord[]> | AiDecisionExplanationRecord[];
}

export class MemoryAiDecisionExplanationService implements AiDecisionExplanationService {
  private explanations: AiDecisionExplanationRecord[] = [];
  private sequence = 0;

  record(input: RecordAiDecisionExplanationInput): AiDecisionExplanationRecord {
    validateInput(input);
    const explanation: AiDecisionExplanationRecord = {
      id: `ai_explain_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      decisionType: input.decisionType,
      modelVersion: input.modelVersion,
      sourceRecordId: input.sourceRecordId,
      sourceFeatureSnapshotId: input.sourceFeatureSnapshotId,
      sourceFeatureVersion: input.sourceFeatureVersion,
      inputFeatures: input.inputFeatures,
      output: input.output,
      threshold: input.threshold,
      reasonCodes: input.reasonCodes?.length ? input.reasonCodes : ['no_reason_codes'],
      createdAt: new Date().toISOString()
    };
    this.explanations.unshift(explanation);
    return explanation;
  }

  list(input: { userId?: string; decisionType?: string; limit?: number } = {}): AiDecisionExplanationRecord[] {
    return this.explanations
      .filter(explanation => !input.userId || explanation.userId === input.userId)
      .filter(explanation => !input.decisionType || explanation.decisionType === input.decisionType)
      .slice(0, normalizeLimit(input.limit));
  }
}

export class PrismaAiDecisionExplanationService implements AiDecisionExplanationService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordAiDecisionExplanationInput): Promise<AiDecisionExplanationRecord> {
    validateInput(input);
    const explanation = await this.prisma.aiDecisionExplanation.create({
      data: {
        userId: input.userId,
        decisionType: input.decisionType,
        modelVersion: input.modelVersion,
        sourceRecordId: input.sourceRecordId,
        sourceFeatureSnapshotId: input.sourceFeatureSnapshotId,
        sourceFeatureVersion: input.sourceFeatureVersion,
        inputFeatures: input.inputFeatures as Prisma.InputJsonObject | undefined,
        output: input.output as Prisma.InputJsonObject | undefined,
        threshold: input.threshold as Prisma.InputJsonObject | undefined,
        reasonCodes: input.reasonCodes?.length ? input.reasonCodes : ['no_reason_codes']
      }
    });
    return aiDecisionExplanationToRecord(explanation);
  }

  async list(input: { userId?: string; decisionType?: string; limit?: number } = {}): Promise<AiDecisionExplanationRecord[]> {
    const explanations = await this.prisma.aiDecisionExplanation.findMany({
      where: {
        userId: input.userId,
        decisionType: input.decisionType
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(input.limit)
    });
    return explanations.map(aiDecisionExplanationToRecord);
  }
}

export const explanationsToCsv = (explanations: AiDecisionExplanationRecord[]) => {
  const headers = [
    'id',
    'userId',
    'decisionType',
    'modelVersion',
    'sourceRecordId',
    'sourceFeatureSnapshotId',
    'sourceFeatureVersion',
    'reasonCodes',
    'threshold',
    'output',
    'createdAt'
  ];
  const rows = explanations.map(explanation => [
    explanation.id,
    explanation.userId,
    explanation.decisionType,
    explanation.modelVersion,
    explanation.sourceRecordId ?? '',
    explanation.sourceFeatureSnapshotId ?? '',
    explanation.sourceFeatureVersion ?? '',
    explanation.reasonCodes.join('|'),
    JSON.stringify(explanation.threshold ?? {}),
    JSON.stringify(explanation.output ?? {}),
    explanation.createdAt
  ]);
  return [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\n');
};

const validateInput = (input: RecordAiDecisionExplanationInput) => {
  assertText(input.userId, 'userId');
  assertText(input.decisionType, 'decisionType');
  assertText(input.modelVersion, 'modelVersion');
};

const normalizeLimit = (limit?: number) => {
  if (!Number.isFinite(limit ?? 50)) return 50;
  return Math.max(1, Math.min(500, Math.floor(limit ?? 50)));
};

const escapeCsvCell = (value: string) => {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const aiDecisionExplanationToRecord = (explanation: {
  id: string;
  userId: string;
  decisionType: string;
  modelVersion: string;
  sourceRecordId: string | null;
  sourceFeatureSnapshotId: string | null;
  sourceFeatureVersion: string | null;
  inputFeatures: Prisma.JsonValue | null;
  output: Prisma.JsonValue | null;
  threshold: Prisma.JsonValue | null;
  reasonCodes: string[];
  createdAt: Date;
}): AiDecisionExplanationRecord => ({
  id: explanation.id,
  userId: explanation.userId,
  decisionType: explanation.decisionType,
  modelVersion: explanation.modelVersion,
  sourceRecordId: explanation.sourceRecordId ?? undefined,
  sourceFeatureSnapshotId: explanation.sourceFeatureSnapshotId ?? undefined,
  sourceFeatureVersion: explanation.sourceFeatureVersion ?? undefined,
  inputFeatures: isRecord(explanation.inputFeatures) ? explanation.inputFeatures : undefined,
  output: isRecord(explanation.output) ? explanation.output : undefined,
  threshold: isRecord(explanation.threshold) ? explanation.threshold : undefined,
  reasonCodes: explanation.reasonCodes,
  createdAt: explanation.createdAt.toISOString()
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
