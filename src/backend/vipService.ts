import { GameRoundRecord } from './casinoService';
import { BonusClaimRecord } from './bonusService';
import { WalletState } from '../domain/ledger';
import { asMoney } from '../domain/money';

export interface VipTier {
  id: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  label: string;
  minSettledStake: number;
  cashbackRate: number;
}

export interface VipStatus {
  userId: string;
  tier: VipTier;
  nextTier?: VipTier;
  settledStake: number;
  netLoss: number;
  cashbackRate: number;
  availableCashback: number;
  nextTierStakeRemaining: number;
  weekKey: string;
  generatedAt: string;
}

export interface VipCashbackClaimResult {
  status: VipStatus;
  claim?: BonusClaimRecord;
  wallet: WalletState;
}

export interface VipService {
  getStatus(input: { userId: string }): Promise<VipStatus> | VipStatus;
  claimCashback(input: { userId: string; idempotencyKey: string }): Promise<VipCashbackClaimResult> | VipCashbackClaimResult;
}

interface VipCasinoReader {
  getWallet(userId: string): Promise<WalletState> | WalletState;
  listRounds(userId?: string): Promise<GameRoundRecord[]> | GameRoundRecord[];
  creditWallet(input: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<WalletState> | WalletState;
}

interface VipBonusLedger {
  listClaims(userId: string): Promise<BonusClaimRecord[]> | BonusClaimRecord[];
  recordCashbackClaim(input: {
    userId: string;
    amount: number;
    claimKey: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<BonusClaimRecord> | BonusClaimRecord;
}

export const VIP_TIERS: VipTier[] = [
  { id: 'bronze', label: 'Bronze', minSettledStake: 0, cashbackRate: 0.01 },
  { id: 'silver', label: 'Silver', minSettledStake: 500, cashbackRate: 0.03 },
  { id: 'gold', label: 'Gold', minSettledStake: 2500, cashbackRate: 0.05 },
  { id: 'platinum', label: 'Platinum', minSettledStake: 10000, cashbackRate: 0.08 },
  { id: 'diamond', label: 'Diamond', minSettledStake: 25000, cashbackRate: 0.12 }
];

export class DeterministicVipService implements VipService {
  constructor(
    private readonly casino: VipCasinoReader,
    private readonly bonusLedger: VipBonusLedger
  ) {}

  async getStatus(input: { userId: string }): Promise<VipStatus> {
    assertText(input.userId, 'userId');
    const [rounds, claims] = await Promise.all([
      this.casino.listRounds(input.userId),
      this.bonusLedger.listClaims(input.userId)
    ]);
    return buildVipStatus({ userId: input.userId, rounds, claims });
  }

  async claimCashback(input: { userId: string; idempotencyKey: string }): Promise<VipCashbackClaimResult> {
    assertText(input.userId, 'userId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const status = await this.getStatus({ userId: input.userId });
    if (status.availableCashback <= 0) {
      return {
        status,
        wallet: await this.casino.getWallet(input.userId)
      };
    }

    const wallet = await this.casino.creditWallet({
      userId: input.userId,
      amount: status.availableCashback,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        source: 'vip_cashback',
        bonusCampaignId: VIP_CASHBACK_CAMPAIGN_ID,
        bonusType: 'cashback',
        weekKey: status.weekKey,
        vipTier: status.tier.id,
        cashbackRate: status.cashbackRate
      }
    });
    const claim = await this.bonusLedger.recordCashbackClaim({
      userId: input.userId,
      amount: status.availableCashback,
      claimKey: status.weekKey,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        weekKey: status.weekKey,
        vipTier: status.tier.id,
        cashbackRate: status.cashbackRate,
        netLoss: status.netLoss
      }
    });
    return {
      status: await this.getStatus({ userId: input.userId }),
      claim,
      wallet
    };
  }
}

export const VIP_CASHBACK_CAMPAIGN_ID = 'vip-weekly-cashback';

export const buildVipStatus = (input: {
  userId: string;
  rounds: GameRoundRecord[];
  claims: BonusClaimRecord[];
  now?: Date;
}): VipStatus => {
  const now = input.now ?? new Date();
  const weekKey = isoWeekKey(now);
  const settledRounds = input.rounds.filter(round => round.status === 'settled');
  const settledStake = asMoney(settledRounds.reduce((sum, round) => sum + round.stake, 0));
  const netLoss = asMoney(settledRounds.reduce((sum, round) => sum + Math.max(0, round.stake - round.payout), 0));
  const tier = resolveVipTier(settledStake);
  const nextTier = VIP_TIERS.find(candidate => candidate.minSettledStake > tier.minSettledStake);
  const alreadyClaimed = input.claims.some(claim =>
    claim.campaignId === VIP_CASHBACK_CAMPAIGN_ID &&
    claim.claimKey === weekKey &&
    claim.status === 'claimed'
  );
  const availableCashback = alreadyClaimed ? 0 : asMoney(Math.floor(netLoss * tier.cashbackRate));
  return {
    userId: input.userId,
    tier,
    nextTier,
    settledStake,
    netLoss,
    cashbackRate: tier.cashbackRate,
    availableCashback,
    nextTierStakeRemaining: nextTier ? asMoney(Math.max(0, nextTier.minSettledStake - settledStake)) : 0,
    weekKey,
    generatedAt: now.toISOString()
  };
};

const resolveVipTier = (settledStake: number): VipTier => {
  return [...VIP_TIERS].reverse().find(tier => settledStake >= tier.minSettledStake) ?? VIP_TIERS[0];
};

const isoWeekKey = (date: Date): string => {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') throw new Error(`${field} is required`);
};
