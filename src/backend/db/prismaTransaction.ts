import { Prisma } from '@prisma/client';

export const withPrismaTransactionRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableTransactionError(error) || attempt === 3) break;
      await delay(50 * attempt);
    }
  }

  throw lastError;
};

export const isRetryableTransactionError = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true;

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('write conflict') ||
    normalized.includes('deadlock') ||
    normalized.includes('serialization failure') ||
    normalized.includes('could not serialize access')
  );
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
