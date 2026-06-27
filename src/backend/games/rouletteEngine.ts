import { randomInt, randomUUID } from 'node:crypto';
import {
  EUROPEAN_ROULETTE_SEQUENCE,
  RouletteBetSlip,
  RouletteOutcome,
  getRouletteColor,
  resolveRoulettePayout,
  totalRouletteStake
} from '../../domain/roulette';
import { asMoney } from '../../domain/money';
import { ProvablyFairProof, rouletteProof } from '../../domain/provablyFair';
import { WalletState } from '../../domain/ledger';
import { GameRoundRecord } from '../casinoService';

export interface RouletteSpinInput {
  userId: string;
  bets: unknown;
  idempotencyKey?: string;
}

export interface RouletteSpinResult {
  round: GameRoundRecord;
  wallet: WalletState;
  outcome: RouletteOutcome;
  stake: number;
  payout: number;
}

interface RouletteSpinOptions {
  pickIndex?: () => number;
  provablyFair?: {
    serverSeed?: string;
    clientSeed?: string;
    nonce?: number;
  };
}

type MaybePromise<T> = T | Promise<T>;

type CasinoServiceLike = {
  placeBet(input: {
    userId: string;
    gameId: string;
    stake: number;
    idempotencyKey: string;
  }): MaybePromise<GameRoundRecord>;
  settleRound(input: {
    roundId: string;
    payout: number;
    idempotencyKey: string;
    outcome?: unknown;
  }): MaybePromise<GameRoundRecord>;
  getWallet(userId: string): MaybePromise<WalletState>;
};

export const spinRoulette = async (
  service: CasinoServiceLike,
  input: RouletteSpinInput,
  options: RouletteSpinOptions = {}
): Promise<RouletteSpinResult> => {
  assertText(input.userId, 'userId');
  const bets = parseRouletteBetSlip(input.bets);
  const stake = totalRouletteStake(bets);
  if (stake <= 0) {
    throw new Error('Roulette stake must be greater than zero');
  }

  const idempotencyKey = input.idempotencyKey || `roulette-${randomUUID()}`;
  const round = await service.placeBet({
    userId: input.userId,
    gameId: 'roulette',
    stake,
    idempotencyKey: `${idempotencyKey}:lock`
  });

  if (round.status === 'settled') {
    const existingOutcome = readSettledRouletteOutcome(round.outcome);
    return {
      round,
      wallet: await service.getWallet(round.userId),
      outcome: existingOutcome,
      stake: round.stake,
      payout: round.payout
    };
  }

  const proof = options.pickIndex ? undefined : rouletteProof({
    ...options.provablyFair,
    clientSeed: options.provablyFair?.clientSeed ?? `${input.userId}:${idempotencyKey}`,
    wheel: EUROPEAN_ROULETTE_SEQUENCE
  });
  const outcome = createRouletteOutcome(options.pickIndex, proof);
  const payout = resolveRoulettePayout(bets, outcome);
  const settledRound = await service.settleRound({
    roundId: round.id,
    payout,
    idempotencyKey: `${idempotencyKey}:settle`,
    outcome: {
      game: 'roulette',
      bets,
      outcome,
      provablyFair: proof
    }
  });

  return {
    round: settledRound,
    wallet: await service.getWallet(settledRound.userId),
    outcome,
    stake,
    payout
  };
};

export const parseRouletteBetSlip = (value: unknown): RouletteBetSlip => {
  if (!isRecord(value)) throw new Error('Roulette bets are required');

  const outsideSource = isRecord(value.outside) ? value.outside : {};
  const straightSource = isRecord(value.straight) ? value.straight : {};

  const outside: RouletteBetSlip['outside'] = {};
  for (const betType of ['red', 'black', 'even', 'odd', 'high', 'low'] as const) {
    const amount = outsideSource[betType];
    if (amount !== undefined) outside[betType] = parseBetAmount(amount, `outside.${betType}`);
  }

  const straight: RouletteBetSlip['straight'] = {};
  for (const [rawNumber, rawAmount] of Object.entries(straightSource)) {
    const number = Number(rawNumber);
    if (!Number.isInteger(number) || number < 0 || number > 36) {
      throw new Error(`Invalid roulette straight number ${rawNumber}`);
    }
    straight[number] = parseBetAmount(rawAmount, `straight.${rawNumber}`);
  }

  return { outside, straight };
};

const createRouletteOutcome = (
  pickIndex = () => randomInt(EUROPEAN_ROULETTE_SEQUENCE.length),
  proof?: ProvablyFairProof
): RouletteOutcome => {
  const index = proof?.result.kind === 'roulette-index' ? proof.result.index : pickIndex();
  if (!Number.isInteger(index) || index < 0 || index >= EUROPEAN_ROULETTE_SEQUENCE.length) {
    throw new Error(`Invalid roulette RNG index ${index}`);
  }
  const number = EUROPEAN_ROULETTE_SEQUENCE[index];
  return {
    number,
    color: getRouletteColor(number)
  };
};

const parseBetAmount = (value: unknown, field: string) => {
  if (typeof value !== 'number') throw new Error(`${field} must be a number`);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return asMoney(value);
};

const readSettledRouletteOutcome = (value: unknown): RouletteOutcome => {
  if (!isRecord(value) || !isRecord(value.outcome)) {
    throw new Error('Settled roulette round is missing outcome data');
  }
  const { number, color } = value.outcome;
  if (typeof number !== 'number' || (color !== 'red' && color !== 'black' && color !== 'green')) {
    throw new Error('Settled roulette round has invalid outcome data');
  }
  return { number, color };
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
