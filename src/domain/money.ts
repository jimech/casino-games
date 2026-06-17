export type Money = number & { readonly __brand: unique symbol };

export const asMoney = (amount: number): Money => {
  if (!Number.isInteger(amount)) {
    throw new Error(`Money amount must be an integer, received ${amount}`);
  }
  if (amount < 0) {
    throw new Error(`Money amount cannot be negative, received ${amount}`);
  }
  return amount as Money;
};

export const addMoney = (left: Money, right: Money): Money => asMoney(left + right);

export const subtractMoney = (left: Money, right: Money): Money => {
  if (right > left) {
    throw new Error(`Insufficient funds: tried to subtract ${right} from ${left}`);
  }
  return asMoney(left - right);
};

export const multiplyMoney = (amount: Money, multiplier: number): Money => {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new Error(`Invalid multiplier ${multiplier}`);
  }
  return asMoney(Math.floor(amount * multiplier));
};
