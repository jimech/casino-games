import { createHash, createHmac, randomBytes } from 'node:crypto';
import { crashPointFromUnitRandom } from './crash';
import { EUROPEAN_ROULETTE_SEQUENCE, getRouletteColor } from './roulette';

export type ProvablyFairResult =
  | { kind: 'roulette-index'; index: number; number: number; color: 'red' | 'black' | 'green'; wheelSize: number }
  | { kind: 'slots-stops'; stops: [number, number, number]; reelLengths: [number, number, number] }
  | { kind: 'crash-unit'; unitRandom: number; crashPoint: number; config: { houseEdgeBps: number; maxMultiplier: number } };

export interface ProvablyFairProof {
  algorithm: 'hmac-sha256-v1';
  gameId: 'roulette' | 'slots' | 'crash';
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  cursor: number;
  result: ProvablyFairResult;
}

export interface ProvablyFairVerification {
  valid: boolean;
  expected: ProvablyFairResult;
  proof: ProvablyFairProof;
  errors: string[];
}

export const createProvablyFairSeed = (input: {
  gameId: ProvablyFairProof['gameId'];
  serverSeed?: string;
  clientSeed?: string;
  nonce?: number;
}) => {
  const serverSeed = input.serverSeed ?? randomBytes(32).toString('hex');
  return {
    gameId: input.gameId,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed: input.clientSeed ?? `${input.gameId}:client`,
    nonce: normalizeNonce(input.nonce)
  };
};

export const hashServerSeed = (serverSeed: string) => createHash('sha256').update(serverSeed).digest('hex');

export const provablyFairUnit = (input: {
  gameId: ProvablyFairProof['gameId'];
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  cursor?: number;
}) => {
  const digest = hmacDigest(input);
  const value = Number.parseInt(digest.slice(0, 13), 16);
  return value / 0x10000000000000;
};

export const provablyFairIndex = (input: {
  gameId: ProvablyFairProof['gameId'];
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  cursor?: number;
  exclusiveMax: number;
}) => {
  if (!Number.isInteger(input.exclusiveMax) || input.exclusiveMax <= 0) {
    throw new Error(`exclusiveMax must be a positive integer, received ${input.exclusiveMax}`);
  }
  return Math.floor(provablyFairUnit(input) * input.exclusiveMax);
};

export const verifyProvablyFairProof = (proof: ProvablyFairProof): ProvablyFairVerification => {
  const errors: string[] = [];
  if (proof.algorithm !== 'hmac-sha256-v1') errors.push('unsupported_algorithm');
  if (hashServerSeed(proof.serverSeed) !== proof.serverSeedHash) errors.push('server_seed_hash_mismatch');

  const expected = expectedResult(proof);
  if (JSON.stringify(expected) !== JSON.stringify(proof.result)) {
    errors.push('result_mismatch');
  }

  return {
    valid: errors.length === 0,
    expected,
    proof,
    errors
  };
};

export const rouletteProof = (input: {
  serverSeed?: string;
  clientSeed?: string;
  nonce?: number;
  cursor?: number;
  wheel: readonly number[];
}): ProvablyFairProof => {
  const seed = createProvablyFairSeed({ gameId: 'roulette', ...input });
  const cursor = normalizeCursor(input.cursor);
  const index = provablyFairIndex({ ...seed, cursor, exclusiveMax: input.wheel.length });
  const number = input.wheel[index];
  return {
    algorithm: 'hmac-sha256-v1',
    ...seed,
    cursor,
    result: {
      kind: 'roulette-index',
      index,
      number,
      color: getRouletteColor(number),
      wheelSize: input.wheel.length
    }
  };
};

export const slotsProof = (input: {
  serverSeed?: string;
  clientSeed?: string;
  nonce?: number;
  cursor?: number;
  reelLengths: [number, number, number];
}): ProvablyFairProof => {
  const seed = createProvablyFairSeed({ gameId: 'slots', ...input });
  const cursor = normalizeCursor(input.cursor);
  return {
    algorithm: 'hmac-sha256-v1',
    ...seed,
    cursor,
    result: {
      kind: 'slots-stops',
      stops: input.reelLengths.map((exclusiveMax, offset) =>
        provablyFairIndex({ ...seed, cursor: cursor + offset, exclusiveMax })
      ) as [number, number, number],
      reelLengths: input.reelLengths
    }
  };
};

export const crashProof = (input: {
  serverSeed?: string;
  clientSeed?: string;
  nonce?: number;
  cursor?: number;
  config: { houseEdgeBps: number; maxMultiplier: number };
}): ProvablyFairProof => {
  const seed = createProvablyFairSeed({ gameId: 'crash', ...input });
  const cursor = normalizeCursor(input.cursor);
  const unitRandom = provablyFairUnit({ ...seed, cursor });
  return {
    algorithm: 'hmac-sha256-v1',
    ...seed,
    cursor,
    result: {
      kind: 'crash-unit',
      unitRandom,
      crashPoint: crashPointFromUnitRandom(unitRandom, input.config),
      config: input.config
    }
  };
};

const expectedResult = (proof: ProvablyFairProof): ProvablyFairResult => {
  if (proof.result.kind === 'roulette-index') {
    const index = provablyFairIndex({ ...proof, exclusiveMax: proof.result.wheelSize });
    const number = proof.result.wheelSize === EUROPEAN_ROULETTE_SEQUENCE.length
      ? EUROPEAN_ROULETTE_SEQUENCE[index]
      : proof.result.number;
    return {
      ...proof.result,
      index,
      number,
      color: getRouletteColor(number)
    };
  }
  if (proof.result.kind === 'slots-stops') {
    return {
      ...proof.result,
      stops: proof.result.reelLengths.map((exclusiveMax, offset) =>
        provablyFairIndex({ ...proof, cursor: proof.cursor + offset, exclusiveMax })
      ) as [number, number, number]
    };
  }
  const unitRandom = provablyFairUnit(proof);
  return {
    ...proof.result,
    unitRandom,
    crashPoint: crashPointFromUnitRandom(unitRandom, proof.result.config)
  };
};

const hmacDigest = (input: {
  gameId: ProvablyFairProof['gameId'];
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  cursor?: number;
}) => createHmac('sha256', input.serverSeed)
  .update(`${input.gameId}:${input.clientSeed}:${normalizeNonce(input.nonce)}:${normalizeCursor(input.cursor)}`)
  .digest('hex');

const normalizeNonce = (nonce?: number) => {
  if (nonce === undefined) return 0;
  if (!Number.isInteger(nonce) || nonce < 0) throw new Error(`nonce must be a non-negative integer, received ${nonce}`);
  return nonce;
};

const normalizeCursor = (cursor?: number) => {
  if (cursor === undefined) return 0;
  if (!Number.isInteger(cursor) || cursor < 0) throw new Error(`cursor must be a non-negative integer, received ${cursor}`);
  return cursor;
};
