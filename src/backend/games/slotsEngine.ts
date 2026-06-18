import { randomInt, randomUUID } from 'node:crypto';
import { WalletState } from '../../domain/ledger';
import { asMoney } from '../../domain/money';
import {
  SlotSpinOutcome,
  getSlotMachine,
  resolveSlotSpin,
  symbolIdsToChars
} from '../../domain/slots';
import { GameRoundRecord } from '../casinoService';

export interface SlotsSpinInput {
  userId: string;
  machineId: string;
  bet: number;
  freeSpin?: boolean;
  bonusMultiplier?: number;
  idempotencyKey?: string;
}

export interface SlotsSpinResult {
  round: GameRoundRecord;
  wallet: WalletState;
  outcome: SlotSpinOutcome & { displaySymbols: [string, string, string] };
}

interface SlotsEngineOptions {
  pickStops?: (stripLengths: [number, number, number]) => [number, number, number];
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
};

export const spinSlots = async (
  service: CasinoServiceLike,
  input: SlotsSpinInput,
  options: SlotsEngineOptions = {}
): Promise<SlotsSpinResult> => {
  assertText(input.userId, 'userId');
  assertText(input.machineId, 'machineId');
  const machine = getSlotMachine(input.machineId);
  const bet = asMoney(input.bet);
  const bonusMultiplier = input.bonusMultiplier ?? (input.freeSpin ? 3 : 1);
  const chargedStake = input.freeSpin ? asMoney(0) : bet;
  const idempotencyKey = input.idempotencyKey || `slots-${randomUUID()}`;

  const stops = (options.pickStops ?? secureStops)([
    machine.reelStrips[0].length,
    machine.reelStrips[1].length,
    machine.reelStrips[2].length
  ]);
  const outcome = resolveSlotSpin(machine, bet, stops, bonusMultiplier);
  const displaySymbols = symbolIdsToChars(machine, outcome.symbols);

  const round = await service.placeBet({
    userId: input.userId,
    gameId: 'slots',
    stake: chargedStake,
    idempotencyKey: `${idempotencyKey}:lock`,
    initialOutcome: {
      game: 'slots',
      machineId: machine.id,
      bet,
      freeSpin: Boolean(input.freeSpin)
    }
  });

  if (round.status === 'settled') {
    return {
      round,
      wallet: await service.getWallet(round.userId),
      outcome: readSettledSlotsOutcome(round)
    };
  }

  const settled = await service.settleRound({
    roundId: round.id,
    payout: outcome.payout,
    idempotencyKey: `${idempotencyKey}:settle`,
    outcome: {
      game: 'slots',
      machineId: machine.id,
      bet,
      chargedStake,
      freeSpin: Boolean(input.freeSpin),
      ...outcome,
      displaySymbols
    }
  });

  return {
    round: settled,
    wallet: await service.getWallet(settled.userId),
    outcome: {
      ...outcome,
      displaySymbols
    }
  };
};

const secureStops = (stripLengths: [number, number, number]): [number, number, number] => [
  randomInt(stripLengths[0]),
  randomInt(stripLengths[1]),
  randomInt(stripLengths[2])
];

const readSettledSlotsOutcome = (round: GameRoundRecord): SlotsSpinResult['outcome'] => {
  if (!isRecord(round.outcome) || round.outcome.game !== 'slots') {
    throw new Error('Settled slots round is missing outcome data');
  }
  const displaySymbols = round.outcome.displaySymbols;
  const symbols = round.outcome.symbols;
  const stops = round.outcome.stops;
  if (!isTripleString(displaySymbols) || !isTripleString(symbols) || !isTripleNumber(stops)) {
    throw new Error('Settled slots round has invalid outcome data');
  }
  return {
    machineId: String(round.outcome.machineId),
    stops,
    symbols,
    displaySymbols,
    payout: asMoney(Number(round.outcome.payout)),
    bonusSpinsAwarded: Number(round.outcome.bonusSpinsAwarded),
    bonusMultiplier: Number(round.outcome.bonusMultiplier)
  };
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isTripleString = (value: unknown): value is [string, string, string] => (
  Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'string')
);

const isTripleNumber = (value: unknown): value is [number, number, number] => (
  Array.isArray(value) && value.length === 3 && value.every(item => typeof item === 'number')
);
