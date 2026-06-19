import { describe, expect, it } from 'vitest';
import { MemoryBonusService } from '../bonusService';
import { CasinoService } from '../casinoService';

describe('bonus service', () => {
  it('lists default campaigns', () => {
    const service = new MemoryBonusService(new CasinoService({ user_1: 1000 }));

    const campaigns = service.listCampaigns();

    expect(campaigns.map(campaign => campaign.id)).toEqual([
      'welcome-match-500',
      'daily-free-credits-100'
    ]);
  });

  it('credits wallet and records a claim exactly once per campaign', async () => {
    const casinoService = new CasinoService({ user_1: 1000 });
    const service = new MemoryBonusService(casinoService);

    const first = await service.claimBonus({
      userId: 'user_1',
      campaignId: 'welcome-match-500',
      idempotencyKey: 'bonus-1'
    });
    const duplicate = await service.claimBonus({
      userId: 'user_1',
      campaignId: 'welcome-match-500',
      idempotencyKey: 'bonus-2'
    });

    expect(first.wallet.available).toBe(1500);
    expect(duplicate.wallet.available).toBe(1500);
    expect(first.claim.claimKey).toBe('once');
    expect(service.listClaims('user_1')).toHaveLength(1);
    expect(casinoService.getLedger('user_1')).toHaveLength(1);
  });

  it('uses the current date as the daily claim key', async () => {
    const casinoService = new CasinoService({ user_1: 1000 });
    const service = new MemoryBonusService(casinoService);

    const claim = await service.claimBonus({
      userId: 'user_1',
      campaignId: 'daily-free-credits-100',
      idempotencyKey: 'daily-1'
    });

    expect(claim.claim.claimKey).toBe(new Date().toISOString().slice(0, 10));
    expect(claim.wallet.available).toBe(1100);
  });
});
