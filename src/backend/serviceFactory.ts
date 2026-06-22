import { CasinoService } from './casinoService';
import { PrismaCasinoService } from './prismaCasinoService';
import { MemoryAiEventService, PrismaAiEventService } from './aiEventService';
import { MemoryAiDecisionExplanationService, PrismaAiDecisionExplanationService } from './aiDecisionExplanationService';
import { MemoryAiModelMonitoringService, PrismaAiModelMonitoringService } from './aiModelMonitoringService';
import { MemoryAiFeatureService, PrismaAiFeatureService } from './aiFeatureService';
import { MemoryAuthService, PrismaAuthService } from './authService';
import { MemoryBonusService, PrismaBonusService } from './bonusService';
import { MemoryComplianceCaseService, PrismaComplianceCaseService } from './complianceCaseService';
import { MemoryNotificationService, PrismaNotificationService } from './notificationService';
import { MemoryRiskService, PrismaRiskService } from './riskService';
import { DeterministicGameRecommendationService } from './gameRecommendationService';
import { DeterministicBonusTargetingService } from './bonusTargetingService';
import { MemoryChurnService, PrismaChurnService } from './churnService';
import { MemoryFraudService, PrismaFraudService } from './fraudService';
import { MemoryResponsiblePlayService, PrismaResponsiblePlayService } from './responsiblePlayService';
import { DeterministicVipService } from './vipService';
import { MemoryTournamentService, PrismaTournamentService } from './tournamentService';
import { prisma } from './db/prisma';

export type CasinoBackendDriver = 'memory' | 'prisma';

export const createCasinoService = () => {
  const driver = (process.env.CASINO_BACKEND_DRIVER ?? 'memory') as CasinoBackendDriver;

  if (driver === 'prisma') {
    return new PrismaCasinoService(prisma);
  }

  return new CasinoService({
    demo: Number(process.env.DEMO_WALLET_BALANCE ?? 100000)
  });
};

export const createServices = () => {
  const casinoService = createCasinoService();
  const driver = (process.env.CASINO_BACKEND_DRIVER ?? 'memory') as CasinoBackendDriver;
  const authService = driver === 'prisma'
    ? new PrismaAuthService(prisma, casinoService)
    : new MemoryAuthService(casinoService);
  const riskService = driver === 'prisma'
    ? new PrismaRiskService(prisma)
    : new MemoryRiskService();
  const bonusService = driver === 'prisma'
    ? new PrismaBonusService(prisma, casinoService)
    : new MemoryBonusService(casinoService);
  const complianceCaseService = driver === 'prisma'
    ? new PrismaComplianceCaseService(prisma)
    : new MemoryComplianceCaseService();
  const notificationService = driver === 'prisma'
    ? new PrismaNotificationService(prisma)
    : new MemoryNotificationService();
  const aiEventService = driver === 'prisma'
    ? new PrismaAiEventService(prisma)
    : new MemoryAiEventService();
  const aiDecisionExplanationService = driver === 'prisma'
    ? new PrismaAiDecisionExplanationService(prisma)
    : new MemoryAiDecisionExplanationService();
  const aiModelMonitoringService = driver === 'prisma'
    ? new PrismaAiModelMonitoringService(prisma)
    : new MemoryAiModelMonitoringService();
  const aiFeatureService = driver === 'prisma'
    ? new PrismaAiFeatureService(prisma, aiEventService)
    : new MemoryAiFeatureService(aiEventService);
  const gameRecommendationService = new DeterministicGameRecommendationService();
  const bonusTargetingService = new DeterministicBonusTargetingService();
  const churnService = driver === 'prisma'
    ? new PrismaChurnService(prisma)
    : new MemoryChurnService();
  const fraudService = driver === 'prisma'
    ? new PrismaFraudService(prisma)
    : new MemoryFraudService();
  const responsiblePlayService = driver === 'prisma'
    ? new PrismaResponsiblePlayService(prisma)
    : new MemoryResponsiblePlayService();
  const vipService = new DeterministicVipService(casinoService, bonusService);
  const tournamentService = driver === 'prisma'
    ? new PrismaTournamentService(prisma, casinoService)
    : new MemoryTournamentService(casinoService);

  return { casinoService, authService, riskService, bonusService, complianceCaseService, notificationService, aiEventService, aiDecisionExplanationService, aiModelMonitoringService, aiFeatureService, gameRecommendationService, bonusTargetingService, churnService, fraudService, responsiblePlayService, vipService, tournamentService };
};
