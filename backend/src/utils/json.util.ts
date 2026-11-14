import { Prisma } from '@prisma/client';

function createJsonValidationError(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeJsonValue(
  value: unknown,
  fieldName: string,
  seen: WeakSet<object>,
  allowNull: boolean
): Prisma.InputJsonValue | null {
  if (value === null) {
    if (allowNull) return null;
    throw createJsonValidationError(`${fieldName} alanı null olamaz`);
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw createJsonValidationError(`${fieldName} alanı geçersiz sayı (NaN/Infinity) içeremez`);
    }
    return value;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw createJsonValidationError(`${fieldName} alanı geçersiz tarih içeriyor`);
    }
    return value.toISOString();
  }

  if (typeof value !== 'object') {
    throw createJsonValidationError(`${fieldName} alanı JSON uyumlu olmalıdır (geçersiz tip: ${typeof value})`);
  }

  if (seen.has(value)) {
    throw createJsonValidationError(`${fieldName} alanı döngüsel referans içeremez`);
  }

  if (Array.isArray(value)) {
    seen.add(value);
    try {
      const result: Array<Prisma.InputJsonValue | null> = [];
      for (let i = 0; i < value.length; i++) {
        result.push(sanitizeJsonValue(value[i], `${fieldName}[${i}]`, seen, true));
      }
      return result as Prisma.InputJsonArray;
    } finally {
      seen.delete(value);
    }
  }

  if (!isPlainObject(value)) {
    throw createJsonValidationError(`${fieldName} alanı düz JSON nesnesi olmalıdır`);
  }

  seen.add(value);
  try {
    const result: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      result[k] = sanitizeJsonValue(v, `${fieldName}.${k}`, seen, true);
    }
    return result as Prisma.InputJsonObject;
  } finally {
    seen.delete(value);
  }
}

/**
 * Verilen değeri çalışma zamanında JSON-serializable olup olmadığını doğrular
 * ve `as` cast kullanmadan `Prisma.InputJsonValue` döndürür.
 */
export function toInputJsonValue(value: unknown, fieldName = 'value'): Prisma.InputJsonValue {
  const sanitized = sanitizeJsonValue(value, fieldName, new WeakSet<object>(), false);
  if (sanitized === null) {
    throw createJsonValidationError(`${fieldName} alanı null olamaz`);
  }
  return sanitized;
}
