import { describe, expect, it } from 'vitest';
import { crashProof, rouletteProof, slotsProof, verifyProvablyFairProof } from '../provablyFair';
import { EUROPEAN_ROULETTE_SEQUENCE } from '../roulette';

describe('provably fair proofs', () => {
  it('verifies a roulette outcome from the revealed server seed', () => {
    const proof = rouletteProof({
      serverSeed: 'roulette-server-seed',
      clientSeed: 'player-seed',
      nonce: 7,
      wheel: EUROPEAN_ROULETTE_SEQUENCE
    });

    const verification = verifyProvablyFairProof(proof);

    expect(verification.valid).toBe(true);
    expect(verification.errors).toEqual([]);
    expect(verification.expected).toEqual(proof.result);
  });

  it('detects tampered slots stops', () => {
    const proof = slotsProof({
      serverSeed: 'slots-server-seed',
      clientSeed: 'player-seed',
      reelLengths: [10, 10, 10]
    });
    if (proof.result.kind !== 'slots-stops') throw new Error('Expected slots proof');

    const verification = verifyProvablyFairProof({
      ...proof,
      result: {
        ...proof.result,
        stops: [0, 0, 0]
      }
    });

    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('result_mismatch');
  });

  it('detects server seed hash mismatch for crash proofs', () => {
    const proof = crashProof({
      serverSeed: 'crash-server-seed',
      clientSeed: 'player-seed',
      config: { houseEdgeBps: 300, maxMultiplier: 1000 }
    });

    const verification = verifyProvablyFairProof({
      ...proof,
      serverSeedHash: 'bad-hash'
    });

    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('server_seed_hash_mismatch');
  });
});
