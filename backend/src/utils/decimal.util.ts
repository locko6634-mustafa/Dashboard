import { Prisma } from '@prisma/client';

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/**
 * Prisma.Decimal, number veya string finansal değerleri güvenli şekilde
 * 2 ondalık basamağa yuvarlanmış number'a dönüştürür.
 * Geçersiz, null veya undefined değerlerde fallback (varsayılan 0) döndürür.
 */
export function toMoneyNumber(value: MoneyInput, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  let num: number;
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }
    num = Number(trimmed);
  } else if (typeof value === 'object' && typeof (value as Prisma.Decimal).toNumber === 'function') {
    num = (value as Prisma.Decimal).toNumber();
  } else {
    num = Number(value);
  }

  if (!Number.isFinite(num)) {
    return fallback;
  }

  const rounded = Math.round((Math.abs(num) + Number.EPSILON) * 100) / 100;
  const signed = num < 0 ? -rounded : rounded;
  return signed === 0 ? 0 : signed;
}
