import 'dotenv/config';
import { PrismaCasinoService } from '../src/backend/prismaCasinoService';
import { PrismaProvablyFairSeedService } from '../src/backend/provablyFairSeedService';
import { prisma } from '../src/backend/db/prisma';

const main = async () => {
  const service = new PrismaCasinoService(prisma);
  const seedService = new PrismaProvablyFairSeedService(prisma);
  const user = await prisma.user.findUnique({ where: { username: 'demo' } });
  if (!user) throw new Error('demo user missing');

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
};

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
