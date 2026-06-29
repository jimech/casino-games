import { PrismaClient } from '@prisma/client';
import { asMoney } from '../domain/money';

export type WithdrawalStatus = 'recorded' | 'pending_review' | 'approved' | 'rejected';
export type WithdrawalMethod = 'card' | 'crypto' | 'bank_wire';

export interface WithdrawalRecord {
  id: string;
  userId: string;
  amount: number;
  method: WithdrawalMethod;
  reference: string;
  status: WithdrawalStatus;
  idempotencyKey: string;
  complianceCaseId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface WithdrawalService {
  create(input: {
    userId: string;
    amount: number;
    method: WithdrawalMethod;
    reference: string;
    status: WithdrawalStatus;
    idempotencyKey: string;
  }): Promise<WithdrawalRecord> | WithdrawalRecord;
  attachComplianceCase(input: {
    reference: string;
    complianceCaseId: string;
  }): Promise<WithdrawalRecord | undefined> | WithdrawalRecord | undefined;
  resolveByReference(input: {
    reference: string;
    status: Extract<WithdrawalStatus, 'approved' | 'rejected'>;
    complianceCaseId?: string;
  }): Promise<WithdrawalRecord | undefined> | WithdrawalRecord | undefined;
  list(input?: {
    userId?: string;
    status?: WithdrawalStatus;
    limit?: number;
  }): Promise<WithdrawalRecord[]> | WithdrawalRecord[];
}

export class MemoryWithdrawalService implements WithdrawalService {
  private records: WithdrawalRecord[] = [];
  private sequence = 0;

  create(input: {
    userId: string;
    amount: number;
    method: WithdrawalMethod;
    reference: string;
    status: WithdrawalStatus;
    idempotencyKey: string;
  }): WithdrawalRecord {
    validateCreate(input);
    const existing = this.records.find(record => record.idempotencyKey === input.idempotencyKey);
    if (existing) return cloneWithdrawal(existing);

    const now = new Date().toISOString();
    const record: WithdrawalRecord = {
      id: `withdrawal_${(++this.sequence).toString().padStart(8, '0')}`,
      userId: input.userId,
      amount: asMoney(input.amount),
      method: input.method,
      reference: input.reference,
      status: input.status,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now
    };
    this.records.unshift(record);
    return cloneWithdrawal(record);
  }

  attachComplianceCase(input: { reference: string; complianceCaseId: string }): WithdrawalRecord | undefined {
    assertText(input.reference, 'reference');
    assertText(input.complianceCaseId, 'complianceCaseId');
    const record = this.records.find(item => item.reference === input.reference);
    if (!record) return undefined;
    record.complianceCaseId = input.complianceCaseId;
    record.updatedAt = new Date().toISOString();
    return cloneWithdrawal(record);
  }

  resolveByReference(input: {
    reference: string;
    status: Extract<WithdrawalStatus, 'approved' | 'rejected'>;
    complianceCaseId?: string;
  }): WithdrawalRecord | undefined {
    assertText(input.reference, 'reference');
    if (input.status !== 'approved' && input.status !== 'rejected') throw new Error('Invalid withdrawal resolution status');
    const record = this.records.find(item => item.reference === input.reference);
    if (!record) return undefined;
    const now = new Date().toISOString();
    record.status = input.status;
    record.complianceCaseId = input.complianceCaseId ?? record.complianceCaseId;
    record.updatedAt = now;
    record.resolvedAt = now;
    return cloneWithdrawal(record);
  }

  list(input: { userId?: string; status?: WithdrawalStatus; limit?: number } = {}): WithdrawalRecord[] {
    return this.records
      .filter(record => !input.userId || record.userId === input.userId)
      .filter(record => !input.status || record.status === input.status)
      .slice(0, normalizeLimit(input.limit))
      .map(cloneWithdrawal);
  }
}

export class PrismaWithdrawalService implements WithdrawalService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    userId: string;
    amount: number;
    method: WithdrawalMethod;
    reference: string;
    status: WithdrawalStatus;
    idempotencyKey: string;
  }): Promise<WithdrawalRecord> {
    validateCreate(input);
    const amount = BigInt(asMoney(input.amount));
    const record = await this.prisma.withdrawalRecord.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        userId: input.userId,
        amount,
        method: input.method,
        reference: input.reference,
        status: input.status,
        idempotencyKey: input.idempotencyKey
      }
    });
    return withdrawalToRecord(record);
  }

  async attachComplianceCase(input: { reference: string; complianceCaseId: string }): Promise<WithdrawalRecord | undefined> {
    assertText(input.reference, 'reference');
    assertText(input.complianceCaseId, 'complianceCaseId');
    const record = await this.prisma.withdrawalRecord.update({
      where: { reference: input.reference },
      data: { complianceCaseId: input.complianceCaseId }
    }).catch(() => undefined);
    return record ? withdrawalToRecord(record) : undefined;
  }

  async resolveByReference(input: {
    reference: string;
    status: Extract<WithdrawalStatus, 'approved' | 'rejected'>;
    complianceCaseId?: string;
  }): Promise<WithdrawalRecord | undefined> {
    assertText(input.reference, 'reference');
    if (input.status !== 'approved' && input.status !== 'rejected') throw new Error('Invalid withdrawal resolution status');
    const record = await this.prisma.withdrawalRecord.update({
      where: { reference: input.reference },
      data: {
        status: input.status,
        complianceCaseId: input.complianceCaseId,
        resolvedAt: new Date()
      }
    }).catch(() => undefined);
    return record ? withdrawalToRecord(record) : undefined;
  }

  async list(input: { userId?: string; status?: WithdrawalStatus; limit?: number } = {}): Promise<WithdrawalRecord[]> {
    const records = await this.prisma.withdrawalRecord.findMany({
      where: {
        userId: input.userId,
        status: input.status
      },
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(input.limit)
    });
    return records.map(withdrawalToRecord);
  }
}

const validateCreate = (input: {
  userId: string;
  amount: number;
  method: WithdrawalMethod;
  reference: string;
  status: WithdrawalStatus;
  idempotencyKey: string;
}) => {
  assertText(input.userId, 'userId');
  assertText(input.reference, 'reference');
  assertText(input.idempotencyKey, 'idempotencyKey');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Withdrawal amount must be positive');
  if (!isWithdrawalMethod(input.method)) throw new Error('Invalid withdrawal method');
  if (!isWithdrawalStatus(input.status)) throw new Error('Invalid withdrawal status');
};

const isWithdrawalMethod = (value: unknown): value is WithdrawalMethod =>
  value === 'card' || value === 'crypto' || value === 'bank_wire';

export const isWithdrawalStatus = (value: unknown): value is WithdrawalStatus =>
  value === 'recorded' || value === 'pending_review' || value === 'approved' || value === 'rejected';

const assertText = (value: string, label: string) => {
  if (!value || !value.trim()) throw new Error(`${label} is required`);
};

const normalizeLimit = (limit?: number) => {
  if (!Number.isFinite(limit ?? 50)) return 50;
  return Math.max(1, Math.min(250, Math.floor(limit ?? 50)));
};

const cloneWithdrawal = (record: WithdrawalRecord): WithdrawalRecord => ({ ...record });

const withdrawalToRecord = (record: {
  id: string;
  userId: string;
  amount: bigint;
  method: string;
  reference: string;
  status: string;
  idempotencyKey: string;
  complianceCaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}): WithdrawalRecord => ({
  id: record.id,
  userId: record.userId,
  amount: Number(record.amount),
  method: record.method as WithdrawalMethod,
  reference: record.reference,
  status: record.status as WithdrawalStatus,
  idempotencyKey: record.idempotencyKey,
  complianceCaseId: record.complianceCaseId ?? undefined,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  resolvedAt: record.resolvedAt?.toISOString()
});
