import 'dotenv/config';
import { PrismaCasinoService } from '../src/backend/prismaCasinoService';
import { prisma } from '../src/backend/db/prisma';

const main = async () => {
  const service = new PrismaCasinoService(prisma);
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

  const after = await service.getWallet(user.id);
  console.log('SMOKE_OK', {
    beforeAvailable: before.available,
    afterAvailable: after.available,
    afterLocked: after.locked
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
