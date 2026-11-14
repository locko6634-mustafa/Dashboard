/**
 * Query/body parametrelerinden yalnızca string değerleri güvenli biçimde çıkarır.
 * Dizi, nesne, sayı veya undefined/null değerlerde undefined döner.
 */
export function extractQueryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
