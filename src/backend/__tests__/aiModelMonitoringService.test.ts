import { describe, expect, it } from 'vitest';
import { AiDecisionExplanationRecord } from '../aiDecisionExplanationService';
import { MemoryAiModelMonitoringService, evaluateAiModelHealth } from '../aiModelMonitoringService';

const explanation = (overrides: Partial<AiDecisionExplanationRecord>): AiDecisionExplanationRecord => ({
  id: overrides.id ?? 'explanation_1',
  userId: overrides.userId ?? 'user_1',
  decisionType: overrides.decisionType ?? 'fraud_score',
  modelVersion: overrides.modelVersion ?? 'fraud-v1',
  sourceFeatureSnapshotId: overrides.sourceFeatureSnapshotId ?? 'snapshot_1',
  sourceFeatureVersion: overrides.sourceFeatureVersion ?? 'behavior-v1',
  inputFeatures: overrides.inputFeatures ?? { sourceEventCount: 3 },
  output: overrides.output,
  threshold: overrides.threshold,
  reasonCodes: overrides.reasonCodes ?? ['payment_velocity'],
  createdAt: overrides.createdAt ?? new Date().toISOString()
});

describe('AI model monitoring service', () => {
  it('marks fallback-heavy models as degraded', () => {
    const report = evaluateAiModelHealth({
      explanations: [
        explanation({ id: 'e1', modelVersion: 'recommendation-fallback-v1', decisionType: 'game_recommendations' }),
        explanation({ id: 'e2', modelVersion: 'recommendation-fallback-v1', decisionType: 'game_recommendations' })
      ]
    });

    expect(report.status).toBe('degraded');
    expect(report.metrics[0].reasonCodes).toContain('fallback_rate_high');
  });

  it('marks disabled controls and stores them newest first', () => {
    const service = new MemoryAiModelMonitoringService();

    service.setControl({ modelKey: 'fraud_score', disabled: false });
    const disabled = service.setControl({ modelKey: 'fraud_score', disabled: true, reason: 'manual test' });

    const report = evaluateAiModelHealth({
      explanations: [explanation({})],
      controls: service.listControls()
    });

    expect(disabled.disabled).toBe(true);
    expect(service.isDisabled('fraud_score')).toBe(true);
    expect(report.status).toBe('disabled');
    expect(report.metrics[0].reasonCodes).toContain('model_disabled');
  });
});
