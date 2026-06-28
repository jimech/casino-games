import { describe, expect, it } from 'vitest';
import { fingerprintPayload, MemoryIdempotencyService } from '../idempotencyService';

describe('idempotency service', () => {
  it('accepts exact request replays and rejects changed payloads', async () => {
    const service = new MemoryIdempotencyService();
    const input = {
      userId: 'user_1',
      scope: 'slots.spin',
      idempotencyKey: 'same-key',
      payload: {
        bet: 10,
        machineId: 'fruit-mania'
      }
    };

    await service.assertRequest(input);
    await service.assertRequest({
      ...input,
      payload: {
        machineId: 'fruit-mania',
        bet: 10
      }
    });

    await expect(service.assertRequest({
      ...input,
      payload: {
        machineId: 'fruit-mania',
        bet: 20
      }
    })).rejects.toThrow('Idempotency conflict');
  });

  it('creates stable fingerprints for reordered object keys', () => {
    expect(fingerprintPayload({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(fingerprintPayload({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it('stores and replays the first successful response without rerunning the handler', async () => {
    const service = new MemoryIdempotencyService();
    let calls = 0;
    const input = {
      userId: 'user_1',
      scope: 'blackjack.action',
      idempotencyKey: 'action-key',
      payload: {
        roundId: 'round_1',
        action: 'hit'
      }
    };

    const first = await service.runWithResponse(input, () => {
      calls += 1;
      return {
        stage: 'after-hit',
        cards: 3
      };
    });
    const replay = await service.runWithResponse(input, () => {
      calls += 1;
      return {
        stage: 'after-second-hit',
        cards: 4
      };
    });

    expect(first).toEqual({
      body: {
        stage: 'after-hit',
        cards: 3
      },
      replayed: false
    });
    expect(replay).toEqual({
      body: {
        stage: 'after-hit',
        cards: 3
      },
      replayed: true
    });
    expect(calls).toBe(1);
  });

  it('emits audit events for exact replays and conflicts', async () => {
    const auditEvents: Array<{ decision: string; scope: string; idempotencyKey: string }> = [];
    const service = new MemoryIdempotencyService(event => {
      auditEvents.push(event);
    });
    const input = {
      userId: 'user_1',
      scope: 'bonus.claim',
      idempotencyKey: 'bonus-key',
      payload: {
        campaignId: 'welcome-match-500'
      }
    };

    await service.assertRequest(input);
    await service.assertRequest(input);
    await expect(service.assertRequest({
      ...input,
      payload: {
        campaignId: 'daily-free-credits-100'
      }
    })).rejects.toThrow('Idempotency conflict');

    expect(auditEvents.map(event => ({
      decision: event.decision,
      scope: event.scope,
      idempotencyKey: event.idempotencyKey
    }))).toEqual([
      {
        decision: 'replay',
        scope: 'bonus.claim',
        idempotencyKey: 'bonus-key'
      },
      {
        decision: 'conflict',
        scope: 'bonus.claim',
        idempotencyKey: 'bonus-key'
      }
    ]);
  });
});
