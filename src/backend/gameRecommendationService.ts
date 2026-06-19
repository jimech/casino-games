import { AiFeatureSnapshotRecord } from './aiFeatureService';

export type RecommendationVolatility = 'Low' | 'Medium' | 'High' | 'Extreme';

export interface RecommendationGame {
  id: string;
  title: string;
  category: string;
  provider: string;
  rtp: string;
  volatility: RecommendationVolatility;
}

export interface GameRecommendation {
  gameId: string;
  rank: number;
  score: number;
  reasons: string[];
}

export interface GameRecommendationResult {
  generatedAt: string;
  source: 'profile' | 'fallback';
  profileVersion?: string;
  recommendations: GameRecommendation[];
}

export interface GameRecommendationService {
  rank(input: {
    games: RecommendationGame[];
    snapshot?: AiFeatureSnapshotRecord;
    limit?: number;
  }): GameRecommendationResult;
}

const VOLATILITY_WEIGHT: Record<RecommendationVolatility, number> = {
  Low: 4,
  Medium: 3,
  High: 2,
  Extreme: 1
};

export class DeterministicGameRecommendationService implements GameRecommendationService {
  rank(input: {
    games: RecommendationGame[];
    snapshot?: AiFeatureSnapshotRecord;
    limit?: number;
  }): GameRecommendationResult {
    const hasProfile = Boolean(input.snapshot && input.snapshot.sourceEventCount > 0);
    const scored = input.games.map(game => scoreGame(game, input.snapshot));
    const recommendations = scored
      .sort((left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title))
      .slice(0, normalizeLimit(input.limit, input.games.length))
      .map((item, index) => ({
        gameId: item.game.id,
        rank: index + 1,
        score: item.score,
        reasons: item.reasons
      }));

    return {
      generatedAt: new Date().toISOString(),
      source: hasProfile ? 'profile' : 'fallback',
      profileVersion: input.snapshot?.version,
      recommendations
    };
  }
}

const scoreGame = (game: RecommendationGame, snapshot?: AiFeatureSnapshotRecord) => {
  const reasons: string[] = [];
  let score = parseRtp(game.rtp) + VOLATILITY_WEIGHT[game.volatility];

  if (!snapshot || snapshot.sourceEventCount === 0) {
    reasons.push('fallback_rtp');
    reasons.push(`fallback_volatility_${game.volatility.toLowerCase()}`);
    return { game, score: roundScore(score), reasons };
  }

  const features = snapshot.features;
  const routeClicks = features.gameSignals.gameClicksByRoute[game.category] ?? 0;
  const directRounds = features.gameSignals.roundsByGameId[game.id] ?? 0;
  const categoryRounds = features.gameSignals.roundsByGameId[game.category] ?? 0;
  const totalGameSignals = features.totals.gameClicks + features.totals.roundsStarted;
  const volatilityPreference = inferVolatilityPreference(snapshot);

  if (game.id === features.gameSignals.favoriteGameId || game.category === features.gameSignals.favoriteGameId) {
    score += 35;
    reasons.push('favorite_game');
  }
  if (game.category === features.gameSignals.favoriteRoute) {
    score += 25;
    reasons.push('favorite_category');
  }
  if (routeClicks > 0) {
    score += Math.min(20, routeClicks * 5);
    reasons.push('clicked_category');
  }
  if (directRounds > 0 || categoryRounds > 0) {
    score += Math.min(25, (directRounds + categoryRounds) * 6);
    reasons.push('played_recently');
  }
  if (game.volatility === volatilityPreference) {
    score += 12;
    reasons.push(`volatility_${volatilityPreference.toLowerCase()}_match`);
  }
  if (features.engagement.recentTabs.includes(game.category)) {
    score += 8;
    reasons.push('recent_tab');
  }
  if (totalGameSignals === 0) {
    score += VOLATILITY_WEIGHT[game.volatility];
    reasons.push('cold_start_quality');
  }
  if (reasons.length === 0) reasons.push('profile_baseline');

  return { game, score: roundScore(score), reasons };
};

const inferVolatilityPreference = (snapshot: AiFeatureSnapshotRecord): RecommendationVolatility => {
  const { averageStake } = snapshot.features.gameSignals;
  const { highStakeRatio } = snapshot.features.riskSignals;
  if (highStakeRatio >= 0.5 || averageStake >= 1000) return 'High';
  if (averageStake >= 500) return 'Medium';
  if (snapshot.features.totals.roundsStarted === 0) return 'Low';
  return 'Low';
};

const parseRtp = (rtp: string) => {
  const parsed = Number.parseFloat(rtp.replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLimit = (limit: number | undefined, max: number) => {
  if (!Number.isFinite(limit ?? max)) return max;
  return Math.max(1, Math.min(max, Math.floor(limit ?? max)));
};

const roundScore = (value: number) => Math.round(value * 100) / 100;

