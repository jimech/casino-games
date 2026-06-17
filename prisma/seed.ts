import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const main = async () => {
  const username = process.env.SEED_USERNAME ?? 'demo';
  const balance = BigInt(Number(process.env.DEMO_WALLET_BALANCE ?? 100000));

  const user = await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username }
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      available: balance,
      locked: 0
    }
  });

  console.log(`Seeded user ${username} with wallet balance ${balance.toString()}`);
};

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
