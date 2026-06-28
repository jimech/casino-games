import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { isRetryableTransactionError, withPrismaTransactionRetry } from '../db/prismaTransaction';

describe('Prisma transaction retry helper', () => {
  it('retries transient Prisma transaction conflicts', async () => {
    let attempts = 0;

    const result = await withPrismaTransactionRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict', {
          code: 'P2034',
          clientVersion: 'test'
        });
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry business rule errors', async () => {
    let attempts = 0;

    await expect(withPrismaTransactionRetry(async () => {
      attempts += 1;
      throw new Error('Insufficient funds');
    })).rejects.toThrow('Insufficient funds');

    expect(attempts).toBe(1);
  });

  it('detects equivalent database conflict messages', () => {
    expect(isRetryableTransactionError(new Error('deadlock detected'))).toBe(true);
    expect(isRetryableTransactionError(new Error('could not serialize access due to concurrent update'))).toBe(true);
    expect(isRetryableTransactionError(new Error('Round is already settled'))).toBe(false);
  });
});
