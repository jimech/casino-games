import { CasinoService } from './casinoService';
import { PrismaCasinoService } from './prismaCasinoService';
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
