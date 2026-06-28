import { describe, expect, it } from 'vitest';
import { fingerprintPayload, MemoryIdempotencyService } from '../idempotencyService';

describe('idempotency service', () => {
  it('accepts exact request replays and rejects changed payloads', () => {
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

    service.assertRequest(input);
    service.assertRequest({
      ...input,
      payload: {
        machineId: 'fruit-mania',
        bet: 10
      }
    });

    expect(() => service.assertRequest({
      ...input,
      payload: {
        machineId: 'fruit-mania',
        bet: 20
      }
    })).toThrow('Idempotency conflict');
  });

  it('creates stable fingerprints for reordered object keys', () => {
    expect(fingerprintPayload({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(fingerprintPayload({ a: { c: 3, d: 4 }, b: 2 }));
  });
});
