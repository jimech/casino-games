import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPasswordForStorage } from '../src/backend/authService';

const prisma = new PrismaClient();

const main = async () => {
  const username = process.env.SEED_USERNAME ?? 'demo';
  const password = process.env.SEED_PASSWORD ?? 'demo-password';
  const balance = BigInt(Number(process.env.DEMO_WALLET_BALANCE ?? 100000));

  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash: hashPasswordForStorage(password) },
    create: {
      username,
      passwordHash: hashPasswordForStorage(password),
      role: 'admin',
      displayName: username,
      ageGateAcceptedAt: new Date(),
      termsAcceptedAt: new Date(),
      privacyAcceptedAt: new Date()
    }
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
