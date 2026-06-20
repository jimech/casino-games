import { Prisma, PrismaClient } from '@prisma/client';
import { AiDecisionExplanationRecord } from './aiDecisionExplanationService';

export interface AiModelControlRecord {
  id: string;
  userId?: string;
  modelKey: string;
  disabled: boolean;
  reason?: string;
  updatedAt: string;
  createdAt: string;
}

export interface AiModelHealthMetric {
  modelKey: string;
  decisionCount: number;
  fallbackCount: number;
  staleInputCount: number;
  fallbackRatio: number;
  staleInputRatio: number;
  disabled: boolean;
  status: 'healthy' | 'degraded' | 'disabled';
  reasonCodes: string[];
}

export interface AiModelHealthReport {
  status: 'healthy' | 'degraded' | 'disabled';
  generatedAt: string;
  metrics: AiModelHealthMetric[];
  controls: AiModelControlRecord[];
}

export interface AiModelMonitoringService {
  setControl(input: { modelKey: string; disabled: boolean; reason?: string; userId?: string }): Promise<AiModelControlRecord> | AiModelControlRecord;
  listControls(): Promise<AiModelControlRecord[]> | AiModelControlRecord[];
  isDisabled(modelKey: string): Promise<boolean> | boolean;
}

export class MemoryAiModelMonitoringService implements AiModelMonitoringService {
  private controls = new Map<string, AiModelControlRecord>();
  private sequence = 0;

  setControl(input: { modelKey: string; disabled: boolean; reason?: string; userId?: string }): AiModelControlRecord {
    assertText(input.modelKey, 'modelKey');
    const existing = this.controls.get(input.modelKey);
    const now = new Date().toISOString();
    const control: AiModelControlRecord = {
      id: existing?.id ?? `ai_model_control_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      modelKey: input.modelKey,
      disabled: input.disabled,
      reason: input.reason,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.controls.set(input.modelKey, control);
    return control;
  }

  listControls(): AiModelControlRecord[] {
    return [...this.controls.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  isDisabled(modelKey: string): boolean {
    return this.controls.get(modelKey)?.disabled ?? false;
  }
}

export class PrismaAiModelMonitoringService implements AiModelMonitoringService {
  constructor(private readonly prisma: PrismaClient) {}

  async setControl(input: { modelKey: string; disabled: boolean; reason?: string; userId?: string }): Promise<AiModelControlRecord> {
    assertText(input.modelKey, 'modelKey');
    const control = await this.prisma.aiModelControl.upsert({
      where: { modelKey: input.modelKey },
      update: {
        disabled: input.disabled,
        reason: input.reason,
        userId: input.userId
      },
      create: {
        modelKey: input.modelKey,
        disabled: input.disabled,
        reason: input.reason,
        userId: input.userId
      }
    });
    return aiModelControlToRecord(control);
  }

  async listControls(): Promise<AiModelControlRecord[]> {
    const controls = await this.prisma.aiModelControl.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    return controls.map(aiModelControlToRecord);
  }

  async isDisabled(modelKey: string): Promise<boolean> {
    const control = await this.prisma.aiModelControl.findUnique({ where: { modelKey } });
    return control?.disabled ?? false;
  }
}

export const evaluateAiModelHealth = (input: {
  explanations: AiDecisionExplanationRecord[];
  controls?: AiModelControlRecord[];
  generatedAt?: string;
}): AiModelHealthReport => {
  const controls = input.controls ?? [];
  const byModel = new Map<string, AiDecisionExplanationRecord[]>();
  for (const explanation of input.explanations) {
    const modelKey = explanation.decisionType;
    byModel.set(modelKey, [...(byModel.get(modelKey) ?? []), explanation]);
  }
  for (const control of controls) {
    if (!byModel.has(control.modelKey)) byModel.set(control.modelKey, []);
  }

  const metrics = [...byModel.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([modelKey, explanations]) => {
      const control = controls.find(item => item.modelKey === modelKey);
      const fallbackCount = explanations.filter(explanation => explanation.modelVersion.includes('fallback')).length;
      const staleInputCount = explanations.filter(explanation =>
        !explanation.sourceFeatureSnapshotId ||
        explanation.inputFeatures?.sourceEventCount === 0
      ).length;
      const decisionCount = explanations.length;
      const fallbackRatio = ratio(fallbackCount, decisionCount);
      const staleInputRatio = ratio(staleInputCount, decisionCount);
      const disabled = control?.disabled ?? false;
      const reasonCodes = [
        ...(disabled ? ['model_disabled'] : []),
        ...(fallbackRatio >= 0.5 && decisionCount > 0 ? ['fallback_rate_high'] : []),
        ...(staleInputRatio >= 0.5 && decisionCount > 0 ? ['stale_input_rate_high'] : [])
      ];
      const status = disabled ? 'disabled' : reasonCodes.length ? 'degraded' : 'healthy';
      return {
        modelKey,
        decisionCount,
        fallbackCount,
        staleInputCount,
        fallbackRatio,
        staleInputRatio,
        disabled,
        status,
        reasonCodes: reasonCodes.length ? reasonCodes : ['healthy']
      } satisfies AiModelHealthMetric;
    });

  const status = metrics.some(metric => metric.status === 'disabled')
    ? 'disabled'
    : metrics.some(metric => metric.status === 'degraded')
      ? 'degraded'
      : 'healthy';

  return {
    status,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    metrics,
    controls
  };
};

const ratio = (part: number, total: number) => total ? Math.round((part / total) * 100) / 100 : 0;

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
};

const aiModelControlToRecord = (control: {
  id: string;
  userId: string | null;
  modelKey: string;
  disabled: boolean;
  reason: string | null;
  updatedAt: Date;
  createdAt: Date;
}): AiModelControlRecord => ({
  id: control.id,
  userId: control.userId ?? undefined,
  modelKey: control.modelKey,
  disabled: control.disabled,
  reason: control.reason ?? undefined,
  updatedAt: control.updatedAt.toISOString(),
  createdAt: control.createdAt.toISOString()
});
