import {
  LedgerEntry,
  WalletState,
  applyWalletCommand,
  createWalletState
} from '../domain/ledger';
import { Money, asMoney } from '../domain/money';

export type GameRoundStatus = 'open' | 'settled' | 'refunded';

export interface GameRoundRecord {
  id: string;
  userId: string;
  gameId: string;
  stake: Money;
  status: GameRoundStatus;
  payout: Money;
  outcome?: unknown;
  lockIdempotencyKey: string;
  settlementIdempotencyKey?: string;
  createdAt: string;
  settledAt?: string;
}

export interface PlaceBetInput {
  userId: string;
  gameId: string;
  stake: number;
  idempotencyKey: string;
  initialOutcome?: unknown;
}

export interface SettleRoundInput {
  roundId: string;
  payout: number;
  idempotencyKey: string;
  outcome?: unknown;
}

export interface RefundRoundInput {
  roundId: string;
  idempotencyKey: string;
  reason?: string;
}

export interface UpdateRoundOutcomeInput {
  roundId: string;
  outcome: unknown;
  eventType?: string;
}

export interface AddRoundStakeInput {
  roundId: string;
  amount: number;
  idempotencyKey: string;
  reason?: string;
}

export interface CreditWalletInput {
  userId: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface DebitWalletInput {
  userId: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface LockWalletInput {
  userId: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface SettleLockedWalletInput {
  userId: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface ReleaseLockedWalletInput {
  userId: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CasinoServiceSnapshot {
  wallets: Record<string, WalletState>;
  ledger: LedgerEntry[];
  rounds: GameRoundRecord[];
}

export interface CreateUserWalletInput {
  userId: string;
  balance?: number;
}

export class CasinoService {
  private wallets = new Map<string, WalletState>();
  private ledger: LedgerEntry[] = [];
  private rounds = new Map<string, GameRoundRecord>();
  private roundByLockKey = new Map<string, string>();
  private sequence = 0;

  constructor(seed: Record<string, number> = { demo: 100000 }) {
    for (const [userId, balance] of Object.entries(seed)) {
      this.wallets.set(userId, createWalletState(balance, 0));
    }
  }

  getWallet(userId: string): WalletState {
    return this.requireWallet(userId);
  }

  createUserWallet(input: CreateUserWalletInput): WalletState {
    this.assertText(input.userId, 'userId');
    if (this.wallets.has(input.userId)) return this.requireWallet(input.userId);
    const wallet = createWalletState(input.balance ?? Number(process.env.DEMO_WALLET_BALANCE ?? 100000), 0);
    this.wallets.set(input.userId, wallet);
    return wallet;
  }

  getLedger(userId: string): LedgerEntry[] {
    return this.ledger.filter(entry => entry.metadata?.userId === userId);
  }

  creditWallet(input: CreditWalletInput): WalletState {
    this.assertText(input.userId, 'userId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = asMoney(input.amount);
    const wallet = this.requireWallet(input.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'credit',
      amount,
      metadata: {
        ...input.metadata,
        userId: input.userId
      }
    });

    this.wallets.set(input.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);
    return commandResult.wallet;
  }

  debitWallet(input: DebitWalletInput): WalletState {
    this.assertText(input.userId, 'userId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = asMoney(input.amount);
    const wallet = this.requireWallet(input.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'debit',
      amount,
      metadata: {
        ...input.metadata,
        userId: input.userId
      }
    });

    this.wallets.set(input.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);
    return commandResult.wallet;
  }

  lockWallet(input: LockWalletInput): WalletState {
    this.assertText(input.userId, 'userId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = asMoney(input.amount);
    const wallet = this.requireWallet(input.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'lock',
      amount,
      metadata: {
        ...input.metadata,
        userId: input.userId
      }
    });

    this.wallets.set(input.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);
    return commandResult.wallet;
  }

  settleLockedWallet(input: SettleLockedWalletInput): WalletState {
    this.assertText(input.userId, 'userId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = asMoney(input.amount);
    const wallet = this.requireWallet(input.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'settleLoss',
      amount,
      metadata: {
        ...input.metadata,
        userId: input.userId
      }
    });

    this.wallets.set(input.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);
    return commandResult.wallet;
  }

  releaseLockedWallet(input: ReleaseLockedWalletInput): WalletState {
    this.assertText(input.userId, 'userId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = asMoney(input.amount);
    const wallet = this.requireWallet(input.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'release',
      amount,
      metadata: {
        ...input.metadata,
        userId: input.userId
      }
    });

    this.wallets.set(input.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);
    return commandResult.wallet;
  }

  listRounds(userId?: string): GameRoundRecord[] {
    const rounds = [...this.rounds.values()];
    return userId ? rounds.filter(round => round.userId === userId) : rounds;
  }

  getRoundById(roundId: string): GameRoundRecord | undefined {
    this.assertText(roundId, 'roundId');
    return this.rounds.get(roundId);
  }

  placeBet(input: PlaceBetInput): GameRoundRecord {
    this.assertText(input.userId, 'userId');
    this.assertText(input.gameId, 'gameId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const stake = asMoney(input.stake);

    const existingRoundId = this.roundByLockKey.get(input.idempotencyKey);
    if (existingRoundId) {
      return this.rounds.get(existingRoundId)!;
    }

    const wallet = this.requireWallet(input.userId);
    const roundId = this.nextId('round');
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'lock',
      amount: stake,
      metadata: {
        userId: input.userId,
        gameId: input.gameId,
        roundId
      }
    });

    this.wallets.set(input.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);

    const now = new Date().toISOString();
    const round: GameRoundRecord = {
      id: roundId,
      userId: input.userId,
      gameId: input.gameId,
      stake,
      status: 'open',
      payout: asMoney(0),
      outcome: input.initialOutcome,
      lockIdempotencyKey: input.idempotencyKey,
      createdAt: now
    };

    this.rounds.set(round.id, round);
    this.roundByLockKey.set(input.idempotencyKey, round.id);
    return round;
  }

  settleRound(input: SettleRoundInput): GameRoundRecord {
    this.assertText(input.roundId, 'roundId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const payout = asMoney(input.payout);
    const round = this.requireRound(input.roundId);

    if (round.status === 'settled') {
      if (round.settlementIdempotencyKey === input.idempotencyKey) return round;
      throw new Error(`Round ${round.id} is already settled`);
    }
    if (round.status !== 'open') {
      throw new Error(`Round ${round.id} is not open`);
    }

    const wallet = this.requireWallet(round.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: payout > 0 ? 'settleWin' : 'settleLoss',
      amount: payout > 0 ? payout : round.stake,
      metadata: {
        userId: round.userId,
        gameId: round.gameId,
        roundId: round.id,
        stake: round.stake,
        outcome: input.outcome
      }
    });

    this.wallets.set(round.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);

    const settled: GameRoundRecord = {
      ...round,
      status: 'settled',
      payout,
      outcome: input.outcome,
      settlementIdempotencyKey: input.idempotencyKey,
      settledAt: new Date().toISOString()
    };
    this.rounds.set(round.id, settled);
    return settled;
  }

  refundRound(input: RefundRoundInput): GameRoundRecord {
    this.assertText(input.roundId, 'roundId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const round = this.requireRound(input.roundId);

    if (round.status === 'refunded') {
      if (round.settlementIdempotencyKey === input.idempotencyKey) return round;
      throw new Error(`Round ${round.id} is already refunded`);
    }
    if (round.status !== 'open') {
      throw new Error(`Round ${round.id} is not open`);
    }

    const wallet = this.requireWallet(round.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'refund',
      amount: round.stake,
      metadata: {
        userId: round.userId,
        gameId: round.gameId,
        roundId: round.id,
        reason: input.reason
      }
    });

    this.wallets.set(round.userId, commandResult.wallet);
    if (commandResult.entry) this.ledger.push(commandResult.entry);

    const refunded: GameRoundRecord = {
      ...round,
      status: 'refunded',
      payout: round.stake,
      settlementIdempotencyKey: input.idempotencyKey,
      settledAt: new Date().toISOString()
    };
    this.rounds.set(round.id, refunded);
    return refunded;
  }

  updateRoundOutcome(input: UpdateRoundOutcomeInput): GameRoundRecord {
    this.assertText(input.roundId, 'roundId');
    const round = this.requireRound(input.roundId);
    if (round.status !== 'open') {
      throw new Error(`Round ${round.id} is not open`);
    }
    const updated: GameRoundRecord = {
      ...round,
      outcome: input.outcome
    };
    this.rounds.set(round.id, updated);
    return updated;
  }

  addRoundStake(input: AddRoundStakeInput): GameRoundRecord {
    this.assertText(input.roundId, 'roundId');
    this.assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = asMoney(input.amount);
    const round = this.requireRound(input.roundId);
    if (round.status !== 'open') {
      throw new Error(`Round ${round.id} is not open`);
    }

    const wallet = this.requireWallet(round.userId);
    const commandResult = applyWalletCommand(wallet, {
      id: this.nextId('ledger'),
      idempotencyKey: input.idempotencyKey,
      type: 'lock',
      amount,
      metadata: {
        userId: round.userId,
        gameId: round.gameId,
        roundId: round.id,
        reason: input.reason
      }
    });

    this.wallets.set(round.userId, commandResult.wallet);
    if (!commandResult.entry) return round;
    this.ledger.push(commandResult.entry);

    const updated: GameRoundRecord = {
      ...round,
      stake: asMoney(round.stake + amount)
    };
    this.rounds.set(round.id, updated);
    return updated;
  }

  snapshot(): CasinoServiceSnapshot {
    return {
      wallets: Object.fromEntries(this.wallets.entries()),
      ledger: [...this.ledger],
      rounds: this.listRounds()
    };
  }

  private requireWallet(userId: string): WalletState {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
    return wallet;
  }

  private requireRound(roundId: string): GameRoundRecord {
    const round = this.rounds.get(roundId);
    if (!round) throw new Error(`Round not found: ${roundId}`);
    return round;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence.toString().padStart(8, '0')}`;
  }

  private assertText(value: string, field: string) {
    if (!value || typeof value !== 'string') {
      throw new Error(`${field} is required`);
    }
  }
}
