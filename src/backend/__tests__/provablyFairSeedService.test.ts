import { describe, expect, it } from 'vitest';
import { MemoryProvablyFairSeedService, publicSeedRecord, seedLifecycle } from '../provablyFairSeedService';

describe('provably fair seed lifecycle service', () => {
  it('commits seeds idempotently and increments nonces per user/game', () => {
    const service = new MemoryProvablyFairSeedService();

    const first = service.commit({ userId: 'user_1', gameId: 'slots', commitmentKey: 'spin-1' });
    const duplicate = service.commit({ userId: 'user_1', gameId: 'slots', commitmentKey: 'spin-1' });
    const second = service.commit({ userId: 'user_1', gameId: 'slots', commitmentKey: 'spin-2' });

    expect(duplicate.id).toBe(first.id);
    expect(first.nonce).toBe(0);
    expect(second.nonce).toBe(1);
    expect(first.serverSeedHash).toHaveLength(64);
  });

  it('hides server seeds until reveal and exposes lifecycle metadata', () => {
    const service = new MemoryProvablyFairSeedService();
    const committed = service.commit({ userId: 'user_1', gameId: 'crash', commitmentKey: 'crash-1' });

    expect(publicSeedRecord(committed).serverSeed).toBeUndefined();
    expect(seedLifecycle(committed)).toMatchObject({ seedId: committed.id, status: 'committed' });

    const revealed = service.reveal({ seedId: committed.id, roundId: 'round_1' });

    expect(publicSeedRecord(revealed).serverSeed).toBe(revealed.serverSeed);
    expect(seedLifecycle(revealed)).toMatchObject({
      seedId: committed.id,
      status: 'revealed',
      revealedAt: revealed.revealedAt
    });
    expect(revealed.roundId).toBe('round_1');
  });
});
