import 'dotenv/config';
import { PrismaCasinoService } from '../src/backend/prismaCasinoService';
import { PrismaProvablyFairSeedService } from '../src/backend/provablyFairSeedService';
import { prisma } from '../src/backend/db/prisma';

const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
const smokeUsernamePrefix = 'prisma_service_smoke_';

const main = async () => {
  const service = new PrismaCasinoService(prisma);
  const seedService = new PrismaProvablyFairSeedService(prisma);
  await cleanupSmokeUsers();

  const user = await prisma.user.create({
    data: {
      username: `${smokeUsernamePrefix}${suffix}`,
      wallet: {
        create: {
          available: 100000,
          locked: 0
        }
      }
    }
  });

  try {
    const before = await service.getWallet(user.id);
    const key = `smoke-${Date.now()}`;
    const round = await service.placeBet({
      userId: user.id,
      gameId: 'smoke',
      stake: 10,
      idempotencyKey: `${key}-bet`
    });

    await service.settleRound({
      roundId: round.id,
      payout: 20,
      idempotencyKey: `${key}-settle`,
      outcome: { smoke: true }
    });
    const seed = await seedService.commit({
      userId: user.id,
      gameId: 'slots',
      commitmentKey: `${key}-seed`,
      clientSeed: 'prisma-smoke-client'
    });
    const duplicateSeed = await seedService.commit({
      userId: user.id,
      gameId: 'slots',
      commitmentKey: `${key}-seed`,
      clientSeed: 'ignored'
    });
    const revealedSeed = await seedService.reveal({ seedId: seed.id, roundId: round.id });
    const seedList = await seedService.listForUser(user.id);
    if (duplicateSeed.id !== seed.id) throw new Error('seed commitment was not idempotent');
    if (revealedSeed.status !== 'revealed' || revealedSeed.roundId !== round.id) {
      throw new Error('seed reveal did not persist round linkage');
    }
    if (!seedList.some(record => record.id === seed.id && record.status === 'revealed' && record.serverSeed)) {
      throw new Error('revealed seed missing from public seed list');
    }

    const after = await service.getWallet(user.id);
    console.log('SMOKE_OK', {
      beforeAvailable: before.available,
      afterAvailable: after.available,
      afterLocked: after.locked,
      seedStatus: revealedSeed.status
    });
  } finally {
    await cleanupSmokeUsers();
  }
};

const cleanupSmokeUsers = async () => {
  await prisma.user.deleteMany({
    where: {
      username: {
        startsWith: smokeUsernamePrefix
      }
    }
  });
};

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
