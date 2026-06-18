import { CasinoService } from './casinoService';
import { PrismaCasinoService } from './prismaCasinoService';
import { MemoryAuthService, PrismaAuthService } from './authService';
import { MemoryRiskService, PrismaRiskService } from './riskService';
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

  return { casinoService, authService, riskService };
};
