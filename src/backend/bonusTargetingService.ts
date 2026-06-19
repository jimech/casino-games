import { AiEventRecord } from './aiEventService';
import { AiFeatureSnapshotRecord } from './aiFeatureService';
import { BonusCampaignRecord, BonusClaimRecord } from './bonusService';

export interface TargetedBonusOffer {
  id: string;
  campaignId: string;
  segment: 'welcome' | 'retention' | 'reactivation';
  title: string;
  description: string;
  score: number;
  amount: number;
  reasonCodes: string[];
  suppressionCodes: string[];
  cooldownUntil?: string;
}

export interface BonusTargetingResult {
  generatedAt: string;
  source: 'profile' | 'fallback';
  profileVersion?: string;
  offers: TargetedBonusOffer[];
  suppressed: TargetedBonusOffer[];
}

export interface BonusTargetingService {
  target(input: {
    campaigns: BonusCampaignRecord[];
    claims: BonusClaimRecord[];
    snapshot?: AiFeatureSnapshotRecord;
    recentTargetingEvents?: AiEventRecord[];
  }): BonusTargetingResult;
}

const TARGETING_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export class DeterministicBonusTargetingService implements BonusTargetingService {
  target(input: {
    campaigns: BonusCampaignRecord[];
    claims: BonusClaimRecord[];
    snapshot?: AiFeatureSnapshotRecord;
    recentTargetingEvents?: AiEventRecord[];
  }): BonusTargetingResult {
    const generatedAt = new Date().toISOString();
    const candidates = buildCandidates(input.campaigns, input.snapshot);
    const evaluated = candidates.map(offer => applySuppressions({
      offer,
      claims: input.claims,
      recentTargetingEvents: input.recentTargetingEvents ?? [],
      generatedAt
    }));
    const offers = evaluated
      .filter(offer => offer.suppressionCodes.length === 0)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
    const suppressed = evaluated
      .filter(offer => offer.suppressionCodes.length > 0)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));

    return {
      generatedAt,
      source: input.snapshot && input.snapshot.sourceEventCount > 0 ? 'profile' : 'fallback',
      profileVersion: input.snapshot?.version,
      offers,
      suppressed
    };
  }
}

const buildCandidates = (
  campaigns: BonusCampaignRecord[],
  snapshot?: AiFeatureSnapshotRecord
): TargetedBonusOffer[] => {
  const byId = new Map(campaigns.map(campaign => [campaign.id, campaign]));
  const welcome = byId.get('welcome-match-500');
  const daily = byId.get('daily-free-credits-100');
  const offers: TargetedBonusOffer[] = [];

  if (welcome) {
    offers.push({
      id: 'target-welcome-match',
      campaignId: welcome.id,
      segment: 'welcome',
      title: welcome.title,
      description: 'One-time starter credits for new private accounts.',
      amount: welcome.amount,
      score: snapshot ? 70 : 90,
      reasonCodes: snapshot ? ['profile_welcome_available'] : ['fallback_welcome_available'],
      suppressionCodes: []
    });
  }

  if (daily) {
    const features = snapshot?.features;
    const highStake = (features?.riskSignals.highStakeRounds ?? 0) > 0;
    const lowBonusUse = (features?.bonusSignals.claims ?? 0) <= 1;
    offers.push({
      id: 'target-daily-retention',
      campaignId: daily.id,
      segment: 'retention',
      title: daily.title,
      description: 'Daily credits targeted at active sessions and low recent bonus usage.',
      amount: daily.amount,
      score: 55 + (highStake ? 20 : 0) + (lowBonusUse ? 10 : 0),
      reasonCodes: [
        highStake ? 'high_stake_activity' : 'standard_daily_rotation',
        lowBonusUse ? 'low_bonus_usage' : 'daily_available'
      ],
      suppressionCodes: []
    });

    const lastEventAt = features?.engagement.lastEventAt;
    const inactiveDays = lastEventAt
      ? (Date.now() - new Date(lastEventAt).getTime()) / (24 * 60 * 60 * 1000)
      : undefined;
    if (inactiveDays === undefined || inactiveDays >= 7) {
      offers.push({
        id: 'target-reactivation-daily',
        campaignId: daily.id,
        segment: 'reactivation',
        title: 'Return Session Credits',
        description: 'Reactivation credits for users without recent play signals.',
        amount: daily.amount,
        score: inactiveDays === undefined ? 45 : 85,
        reasonCodes: [inactiveDays === undefined ? 'no_recent_profile' : 'inactive_7_days'],
        suppressionCodes: []
      });
    }
  }

  return offers;
};

const applySuppressions = (input: {
  offer: TargetedBonusOffer;
  claims: BonusClaimRecord[];
  recentTargetingEvents: AiEventRecord[];
  generatedAt: string;
}): TargetedBonusOffer => {
  const suppressionCodes: string[] = [];
  const campaignClaims = input.claims.filter(claim => claim.campaignId === input.offer.campaignId);
  const today = input.generatedAt.slice(0, 10);

  if (input.offer.segment === 'welcome' && campaignClaims.length > 0) {
    suppressionCodes.push('campaign_already_claimed');
  }
  if (input.offer.segment !== 'welcome' && campaignClaims.some(claim => claim.createdAt.slice(0, 10) === today)) {
    suppressionCodes.push('daily_claimed_today');
  }

  const lastTargetedAt = latestOfferTargetedAt(input.offer.id, input.recentTargetingEvents);
  const cooldownUntil = lastTargetedAt
    ? new Date(new Date(lastTargetedAt).getTime() + TARGETING_COOLDOWN_MS).toISOString()
    : undefined;
  if (cooldownUntil && cooldownUntil > input.generatedAt) {
    suppressionCodes.push('targeting_cooldown_active');
  }

  return {
    ...input.offer,
    suppressionCodes,
    cooldownUntil
  };
};

const latestOfferTargetedAt = (offerId: string, events: AiEventRecord[]) => {
  const matching = events
    .filter(event => event.name === 'bonus_targets_generated')
    .filter(event => Array.isArray(event.context?.offerIds) && event.context.offerIds.includes(offerId))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  return matching[0]?.createdAt;
};

