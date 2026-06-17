import { Money, addMoney, asMoney, subtractMoney } from './money';

export type LedgerEntryType =
  | 'credit'
  | 'debit'
  | 'lock'
  | 'release'
  | 'settleLoss'
  | 'settleWin'
  | 'refund';

export interface WalletState {
  available: Money;
  locked: Money;
  appliedIdempotencyKeys: readonly string[];
}

export interface LedgerEntry {
  id: string;
  idempotencyKey: string;
  type: LedgerEntryType;
  amount: Money;
  balanceBefore: WalletState;
  balanceAfter: WalletState;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WalletCommand {
  id: string;
  idempotencyKey: string;
  type: LedgerEntryType;
  amount: Money;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export const createWalletState = (available = 0, locked = 0): WalletState => ({
  available: asMoney(available),
  locked: asMoney(locked),
  appliedIdempotencyKeys: []
});

export const applyWalletCommand = (
  wallet: WalletState,
  command: WalletCommand
): { wallet: WalletState; entry: LedgerEntry | null } => {
  if (wallet.appliedIdempotencyKeys.includes(command.idempotencyKey)) {
    return { wallet, entry: null };
  }

  const before = cloneWallet(wallet);
  const nextKeys = [...wallet.appliedIdempotencyKeys, command.idempotencyKey];
  let after: WalletState;

  switch (command.type) {
    case 'credit':
      after = {
        available: addMoney(wallet.available, command.amount),
        locked: wallet.locked,
        appliedIdempotencyKeys: nextKeys
      };
      break;
    case 'debit':
      after = {
        available: subtractMoney(wallet.available, command.amount),
        locked: wallet.locked,
        appliedIdempotencyKeys: nextKeys
      };
      break;
    case 'lock':
      after = {
        available: subtractMoney(wallet.available, command.amount),
        locked: addMoney(wallet.locked, command.amount),
        appliedIdempotencyKeys: nextKeys
      };
      break;
    case 'release':
    case 'refund':
      after = {
        available: addMoney(wallet.available, command.amount),
        locked: subtractMoney(wallet.locked, command.amount),
        appliedIdempotencyKeys: nextKeys
      };
      break;
    case 'settleLoss':
      after = {
        available: wallet.available,
        locked: subtractMoney(wallet.locked, command.amount),
        appliedIdempotencyKeys: nextKeys
      };
      break;
    case 'settleWin':
      after = {
        available: addMoney(wallet.available, command.amount),
        locked: subtractMoney(wallet.locked, asMoney(Number(command.metadata?.stake ?? 0))),
        appliedIdempotencyKeys: nextKeys
      };
      break;
  }

  return {
    wallet: after,
    entry: {
      id: command.id,
      idempotencyKey: command.idempotencyKey,
      type: command.type,
      amount: command.amount,
      balanceBefore: before,
      balanceAfter: cloneWallet(after),
      metadata: command.metadata,
      createdAt: command.createdAt ?? new Date().toISOString()
    }
  };
};

const cloneWallet = (wallet: WalletState): WalletState => ({
  available: wallet.available,
  locked: wallet.locked,
  appliedIdempotencyKeys: [...wallet.appliedIdempotencyKeys]
});
