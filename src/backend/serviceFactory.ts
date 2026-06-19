import { CasinoService } from './casinoService';
import { PrismaCasinoService } from './prismaCasinoService';
import { MemoryAiEventService, PrismaAiEventService } from './aiEventService';
import { MemoryAiFeatureService, PrismaAiFeatureService } from './aiFeatureService';
import { MemoryAuthService, PrismaAuthService } from './authService';
import { MemoryBonusService, PrismaBonusService } from './bonusService';
import { MemoryNotificationService, PrismaNotificationService } from './notificationService';
import { MemoryRiskService, PrismaRiskService } from './riskService';
import { DeterministicGameRecommendationService } from './gameRecommendationService';
import { DeterministicBonusTargetingService } from './bonusTargetingService';
import { MemoryChurnService, PrismaChurnService } from './churnService';
import { MemoryFraudService, PrismaFraudService } from './fraudService';
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
  const notificationService = driver === 'prisma'
    ? new PrismaNotificationService(prisma)
    : new MemoryNotificationService();
  const aiEventService = driver === 'prisma'
    ? new PrismaAiEventService(prisma)
    : new MemoryAiEventService();
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

  return { casinoService, authService, riskService, bonusService, notificationService, aiEventService, aiFeatureService, gameRecommendationService, bonusTargetingService, churnService, fraudService };
};
