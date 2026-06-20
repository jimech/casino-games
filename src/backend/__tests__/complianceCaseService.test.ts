import { describe, expect, it } from 'vitest';
import { MemoryComplianceCaseService } from '../complianceCaseService';

describe('compliance case service', () => {
  it('creates cases with structured evidence and an opening note', () => {
    const service = new MemoryComplianceCaseService();

    const caseRecord = service.create({
      subjectUserId: 'user_1',
      authorId: 'admin_1',
      type: 'fraud',
      priority: 'high',
      title: 'Review fraud anomaly',
      evidence: { riskEventId: 'risk_1', explanationId: 'ai_explain_1' }
    });

    expect(caseRecord.status).toBe('open');
    expect(caseRecord.notes[0]).toMatchObject({ action: 'created', status: 'open' });
    expect(caseRecord.evidence?.riskEventId).toBe('risk_1');
  });

  it('adds review notes and closes cases with outcome', () => {
    const service = new MemoryComplianceCaseService();
    const caseRecord = service.create({
      subjectUserId: 'user_1',
      authorId: 'admin_1',
      type: 'responsible_play',
      title: 'Review intervention'
    });

    const closed = service.addNote({
      caseId: caseRecord.id,
      authorId: 'admin_1',
      note: 'Reviewed intervention history and closed.',
      action: 'closed',
      status: 'closed',
      outcome: 'no_action_needed',
      evidence: { interventionId: 'rp_1' }
    });

    expect(closed.status).toBe('closed');
    expect(closed.closedAt).toBeDefined();
    expect(closed.outcome).toBe('no_action_needed');
    expect(closed.notes[0].evidence?.interventionId).toBe('rp_1');
  });

  it('filters queue by status and type', () => {
    const service = new MemoryComplianceCaseService();
    const fraud = service.create({ subjectUserId: 'user_1', authorId: 'admin_1', type: 'fraud', title: 'Fraud' });
    service.create({ subjectUserId: 'user_2', authorId: 'admin_1', type: 'security', title: 'Security' });
    service.addNote({ caseId: fraud.id, authorId: 'admin_1', note: 'In review', status: 'in_review' });

    expect(service.list({ status: 'in_review' }).map(item => item.id)).toEqual([fraud.id]);
    expect(service.list({ type: 'security' })).toHaveLength(1);
  });
});
