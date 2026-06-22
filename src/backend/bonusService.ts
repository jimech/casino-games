import { Prisma, PrismaClient } from '@prisma/client';
import { WalletState } from '../domain/ledger';
import { asMoney } from '../domain/money';

export type BonusCampaignType = 'welcome' | 'daily' | 'cashback' | 'freeSpins';

export interface BonusCampaignRecord {
  id: string;
  type: BonusCampaignType;
  title: string;
  description?: string;
  amount: number;
  metadata?: Record<string, unknown>;
  active: boolean;
}

export interface BonusClaimRecord {
  id: string;
  userId: string;
  campaignId: string;
  amount: number;
  status: 'claimed' | 'rejected';
  claimKey: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface BonusClaimResult {
  campaign: BonusCampaignRecord;
  claim: BonusClaimRecord;
  wallet: WalletState;
}

export interface BonusService {
  listCampaigns(): Promise<BonusCampaignRecord[]> | BonusCampaignRecord[];
  listClaims(userId: string): Promise<BonusClaimRecord[]> | BonusClaimRecord[];
  claimBonus(input: { userId: string; campaignId: string; idempotencyKey: string }): Promise<BonusClaimResult> | BonusClaimResult;
  recordCashbackClaim(input: {
    userId: string;
    amount: number;
    claimKey: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<BonusClaimRecord> | BonusClaimRecord;
}

interface WalletCreditor {
  getWallet(userId: string): Promise<WalletState> | WalletState;
  creditWallet(input: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<WalletState> | WalletState;
}

const DEFAULT_CAMPAIGNS: BonusCampaignRecord[] = [
  {
    id: 'welcome-match-500',
    type: 'welcome',
    title: 'Welcome Match Credits',
    description: 'One-time private welcome credit.',
    amount: 500,
    active: true,
    metadata: { uiLabel: '100% Match Welcome Bonus' }
  },
  {
    id: 'daily-free-credits-100',
    type: 'daily',
    title: 'Daily Free Credits',
    description: 'Daily private credits replacing the old local free-spin reward.',
    amount: 100,
    active: true,
    metadata: { freeSpins: 50 }
  },
  {
    id: 'vip-weekly-cashback',
    type: 'cashback',
    title: 'VIP Weekly Cashback',
    description: 'Weekly cashback based on settled net losses and VIP tier.',
    amount: 0,
    active: true,
    metadata: { claimRule: 'weekly_net_loss_cashback' }
  }
];

export class MemoryBonusService implements BonusService {
  private campaigns = new Map(DEFAULT_CAMPAIGNS.map(campaign => [campaign.id, campaign]));
  private claims = new Map<string, BonusClaimRecord>();
  private claimByUserCampaignKey = new Map<string, string>();
  private sequence = 0;

  constructor(private readonly walletCreditor: WalletCreditor) {}

  listCampaigns(): BonusCampaignRecord[] {
    return [...this.campaigns.values()].filter(campaign => campaign.active);
  }

  listClaims(userId: string): BonusClaimRecord[] {
    return [...this.claims.values()].filter(claim => claim.userId === userId);
  }

  async claimBonus(input: { userId: string; campaignId: string; idempotencyKey: string }): Promise<BonusClaimResult> {
    assertText(input.userId, 'userId');
    assertText(input.campaignId, 'campaignId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign?.active) throw new Error(`Bonus campaign not found: ${input.campaignId}`);

    const claimKey = resolveClaimKey(campaign);
    const existingClaimId = this.claimByUserCampaignKey.get(userCampaignClaimKey(input.userId, input.campaignId, claimKey));
    if (existingClaimId) {
      const existingClaim = this.claims.get(existingClaimId)!;
      return {
        campaign,
        claim: existingClaim,
        wallet: await this.walletCreditor.getWallet(input.userId)
      };
    }

    const wallet = await this.walletCreditor.creditWallet({
      userId: input.userId,
      amount: campaign.amount,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        source: 'bonus',
        bonusCampaignId: campaign.id,
        bonusType: campaign.type
      }
    });

    const claim: BonusClaimRecord = {
      id: `bonus_claim_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      campaignId: campaign.id,
      amount: campaign.amount,
      status: 'claimed',
      claimKey,
      idempotencyKey: input.idempotencyKey,
      metadata: campaign.metadata,
      createdAt: new Date().toISOString()
    };
    this.claims.set(claim.id, claim);
    this.claimByUserCampaignKey.set(userCampaignClaimKey(input.userId, input.campaignId, claimKey), claim.id);
    return { campaign, claim, wallet };
  }

  async recordCashbackClaim(input: {
    userId: string;
    amount: number;
    claimKey: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<BonusClaimRecord> {
    assertText(input.userId, 'userId');
    assertText(input.claimKey, 'claimKey');
    assertText(input.idempotencyKey, 'idempotencyKey');
    const amount = asMoney(input.amount);
    const campaign = this.campaigns.get('vip-weekly-cashback');
    if (!campaign?.active) throw new Error('VIP cashback campaign not found');
    const existingClaimId = this.claimByUserCampaignKey.get(userCampaignClaimKey(input.userId, campaign.id, input.claimKey));
    if (existingClaimId) return this.claims.get(existingClaimId)!;
    const claim: BonusClaimRecord = {
      id: `bonus_claim_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      campaignId: campaign.id,
      amount,
      status: 'claimed',
      claimKey: input.claimKey,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        ...input.metadata,
        campaignType: campaign.type
      },
      createdAt: new Date().toISOString()
    };
    this.claims.set(claim.id, claim);
    this.claimByUserCampaignKey.set(userCampaignClaimKey(input.userId, campaign.id, input.claimKey), claim.id);
    return claim;
  }
}

export class PrismaBonusService implements BonusService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletCreditor: WalletCreditor
  ) {}

  async listCampaigns(): Promise<BonusCampaignRecord[]> {
    await this.ensureDefaultCampaigns();
    const campaigns = await this.prisma.bonusCampaign.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' }
    });
    return campaigns.map(campaignToRecord);
  }

  async listClaims(userId: string): Promise<BonusClaimRecord[]> {
    const claims = await this.prisma.bonusClaim.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    return claims.map(claimToRecord);
  }

  async claimBonus(input: { userId: string; campaignId: string; idempotencyKey: string }): Promise<BonusClaimResult> {
    assertText(input.userId, 'userId');
    assertText(input.campaignId, 'campaignId');
    assertText(input.idempotencyKey, 'idempotencyKey');
    await this.ensureDefaultCampaigns();

    const campaign = await this.prisma.bonusCampaign.findFirst({
      where: { id: input.campaignId, active: true }
    });
    if (!campaign) throw new Error(`Bonus campaign not found: ${input.campaignId}`);

    const claimKey = resolveClaimKey(campaignToRecord(campaign));
    const existing = await this.prisma.bonusClaim.findUnique({
      where: { userId_campaignId_claimKey: { userId: input.userId, campaignId: input.campaignId, claimKey } }
    });
    if (existing) {
      return {
        campaign: campaignToRecord(campaign),
        claim: claimToRecord(existing),
        wallet: await this.walletCreditor.getWallet(input.userId)
      };
    }

    const wallet = await this.walletCreditor.creditWallet({
      userId: input.userId,
      amount: toSafeNumber(campaign.amount),
      idempotencyKey: input.idempotencyKey,
      metadata: {
        source: 'bonus',
        bonusCampaignId: campaign.id,
        bonusType: campaign.type
      }
    });

    const claim = await this.prisma.bonusClaim.create({
      data: {
        userId: input.userId,
        campaignId: campaign.id,
        amount: campaign.amount,
        claimKey,
        idempotencyKey: input.idempotencyKey,
        metadata: campaign.metadata as Prisma.InputJsonValue | undefined
      }
    });

    return {
      campaign: campaignToRecord(campaign),
      claim: claimToRecord(claim),
      wallet
    };
  }

  async recordCashbackClaim(input: {
    userId: string;
    amount: number;
    claimKey: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<BonusClaimRecord> {
    assertText(input.userId, 'userId');
    assertText(input.claimKey, 'claimKey');
    assertText(input.idempotencyKey, 'idempotencyKey');
    await this.ensureDefaultCampaigns();
    const campaign = await this.prisma.bonusCampaign.findFirst({
      where: { id: 'vip-weekly-cashback', active: true }
    });
    if (!campaign) throw new Error('VIP cashback campaign not found');
    const existing = await this.prisma.bonusClaim.findUnique({
      where: { userId_campaignId_claimKey: { userId: input.userId, campaignId: campaign.id, claimKey: input.claimKey } }
    });
    if (existing) return claimToRecord(existing);
    const claim = await this.prisma.bonusClaim.create({
      data: {
        userId: input.userId,
        campaignId: campaign.id,
        amount: BigInt(asMoney(input.amount)),
        claimKey: input.claimKey,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          ...input.metadata,
          campaignType: campaign.type
        } as Prisma.InputJsonValue
      }
    });
    return claimToRecord(claim);
  }

  private async ensureDefaultCampaigns() {
    for (const campaign of DEFAULT_CAMPAIGNS) {
      await this.prisma.bonusCampaign.upsert({
        where: { id: campaign.id },
        update: {
          title: campaign.title,
          description: campaign.description,
          amount: BigInt(asMoney(campaign.amount)),
          metadata: campaign.metadata as Prisma.InputJsonValue,
          active: campaign.active
        },
        create: {
          id: campaign.id,
          type: campaign.type,
          title: campaign.title,
          description: campaign.description,
          amount: BigInt(asMoney(campaign.amount)),
          metadata: campaign.metadata as Prisma.InputJsonValue,
          active: campaign.active
        }
      });
    }
  }
}

const campaignToRecord = (campaign: {
  id: string;
  type: string;
  title: string;
  description: string | null;
  amount: bigint;
  metadata: Prisma.JsonValue | null;
  active: boolean;
}): BonusCampaignRecord => ({
  id: campaign.id,
  type: campaign.type as BonusCampaignType,
  title: campaign.title,
  description: campaign.description ?? undefined,
  amount: toSafeNumber(campaign.amount),
  metadata: isRecord(campaign.metadata) ? campaign.metadata : undefined,
  active: campaign.active
});

const claimToRecord = (claim: {
  id: string;
  userId: string;
  campaignId: string;
  amount: bigint;
  status: string;
  claimKey: string;
  idempotencyKey: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}): BonusClaimRecord => ({
  id: claim.id,
  userId: claim.userId,
  campaignId: claim.campaignId,
  amount: toSafeNumber(claim.amount),
  status: claim.status as BonusClaimRecord['status'],
  claimKey: claim.claimKey,
  idempotencyKey: claim.idempotencyKey,
  metadata: isRecord(claim.metadata) ? claim.metadata : undefined,
  createdAt: claim.createdAt.toISOString()
});

const userCampaignClaimKey = (userId: string, campaignId: string, claimKey: string) => `${userId}:${campaignId}:${claimKey}`;

const resolveClaimKey = (campaign: BonusCampaignRecord): string => {
  if (campaign.type === 'daily') return new Date().toISOString().slice(0, 10);
  return 'once';
};

const assertText = (value: string, field: string) => {
  if (!value || typeof value !== 'string') throw new Error(`${field} is required`);
};

const toSafeNumber = (value: bigint): number => {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new Error(`Database money value exceeds safe integer range: ${value.toString()}`);
  }
  return numberValue;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
