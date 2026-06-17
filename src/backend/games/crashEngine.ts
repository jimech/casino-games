import { randomInt, randomUUID } from 'node:crypto';
import { WalletState } from '../../domain/ledger';
import { asMoney } from '../../domain/money';
import { crashPointFromUnitRandom, multiplierFromElapsedMs, resolveCrashCashout } from '../../domain/crash';
import { GameRoundRecord } from '../casinoService';

const RANDOM_SCALE = 1_000_000_000;
const DEFAULT_CONFIG = { houseEdgeBps: 300, maxMultiplier: 1000 };

export interface CrashStartInput {
  userId: string;
  stake: number;
  idempotencyKey?: string;
}

export interface CrashCashoutInput {
  roundId: string;
  cashoutMultiplier: number;
  idempotencyKey?: string;
}

export interface CrashStartResult {
  round: GameRoundRecord;
  wallet: WalletState;
  crashPoint: number;
}

export interface CrashCashoutResult {
  round: GameRoundRecord;
  wallet: WalletState;
  crashPoint: number;
  cashoutMultiplier: number;
  payout: number;
}

interface CrashEngineOptions {
  unitRandom?: () => number;
  now?: () => Date;
}

type MaybePromise<T> = T | Promise<T>;

type CasinoServiceLike = {
  placeBet(input: {
    userId: string;
    gameId: string;
    stake: number;
    idempotencyKey: string;
    initialOutcome?: unknown;
  }): MaybePromise<GameRoundRecord>;
  settleRound(input: {
    roundId: string;
    payout: number;
    idempotencyKey: string;
    outcome?: unknown;
  }): MaybePromise<GameRoundRecord>;
  getWallet(userId: string): MaybePromise<WalletState>;
  listRounds(userId?: string): MaybePromise<GameRoundRecord[]>;
};

export const startCrashRound = async (
  service: CasinoServiceLike,
  input: CrashStartInput,
  options: CrashEngineOptions = {}
): Promise<CrashStartResult> => {
  assertText(input.userId, 'userId');
  const stake = asMoney(input.stake);
  if (stake <= 0) throw new Error('Crash stake must be greater than zero');

  const unitRandom = options.unitRandom ?? secureUnitRandom;
  const crashPoint = crashPointFromUnitRandom(unitRandom(), DEFAULT_CONFIG);
  const launchTime = (options.now ?? (() => new Date()))().toISOString();
  const idempotencyKey = input.idempotencyKey || `crash-${randomUUID()}`;

  const round = await service.placeBet({
    userId: input.userId,
    gameId: 'crash',
    stake,
    idempotencyKey: `${idempotencyKey}:lock`,
    initialOutcome: {
      game: 'crash',
      crashPoint,
      launchTime,
      config: DEFAULT_CONFIG
    }
  });

  return {
    round,
    wallet: await service.getWallet(round.userId),
    crashPoint: readCrashPoint(round)
  };
};

export const cashoutCrashRound = async (
  service: CasinoServiceLike,
  input: CrashCashoutInput,
  options: Pick<CrashEngineOptions, 'now'> = {}
): Promise<CrashCashoutResult> => {
  assertText(input.roundId, 'roundId');
  if (!Number.isFinite(input.cashoutMultiplier) || input.cashoutMultiplier < 1) {
    throw new Error('cashoutMultiplier must be at least 1');
  }

  const round = await findRound(service, input.roundId);
  if (round.gameId !== 'crash') throw new Error(`Round ${round.id} is not a crash round`);
  const crashState = readCrashState(round);
  const serverMultiplier = multiplierFromElapsedMs(
    Math.max(0, (options.now ?? (() => new Date()))().getTime() - new Date(crashState.launchTime).getTime())
  );
  const requestedMultiplier = Math.floor(input.cashoutMultiplier * 100) / 100;
  const cashoutMultiplier = serverMultiplier >= crashState.crashPoint
    ? crashState.crashPoint
    : Math.min(requestedMultiplier, serverMultiplier);
  const payout = serverMultiplier >= crashState.crashPoint
    ? asMoney(0)
    : resolveCrashCashout(round.stake, cashoutMultiplier, crashState.crashPoint);
  const idempotencyKey = input.idempotencyKey || `crash-cashout-${randomUUID()}`;

  const settled = await service.settleRound({
    roundId: round.id,
    payout,
    idempotencyKey,
    outcome: {
      ...(isRecord(round.outcome) ? round.outcome : {}),
      serverMultiplier,
      cashoutMultiplier,
      payout
    }
  });

  return {
    round: settled,
    wallet: await service.getWallet(settled.userId),
    crashPoint: crashState.crashPoint,
    cashoutMultiplier,
    payout
  };
};

const findRound = async (service: CasinoServiceLike, roundId: string) => {
  const rounds = await service.listRounds();
  const round = rounds.find(candidate => candidate.id === roundId);
  if (!round) throw new Error(`Round not found: ${roundId}`);
  return round;
};

const readCrashPoint = (round: GameRoundRecord): number => {
  return readCrashState(round).crashPoint;
};

const readCrashState = (round: GameRoundRecord): { crashPoint: number; launchTime: string } => {
  if (!isRecord(round.outcome) || typeof round.outcome.crashPoint !== 'number') {
    throw new Error(`Crash round ${round.id} is missing crash point`);
  }
  if (typeof round.outcome.launchTime !== 'string') {
    throw new Error(`Crash round ${round.id} is missing launch time`);
  }
  return {
    crashPoint: round.outcome.crashPoint,
    launchTime: round.outcome.launchTime
  };
};

const secureUnitRandom = () => randomInt(RANDOM_SCALE) / RANDOM_SCALE;

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
