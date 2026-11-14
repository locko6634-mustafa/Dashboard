const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * YYYY-MM-DD formatında ve takvim olarak geçerli bir tarih dizesi olup olmadığını doğrular.
 */
export function isValidDateString(value: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!DATE_REGEX.test(trimmed)) return false;

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * HH:mm veya HH:mm:ss biçimindeki saat dizesini 00:00'dan itibaren geçen dakika sayısına çevirir.
 * Geçersiz format, NaN veya aralık dışı (saat 0-23, dakika 0-59, saniye 0-59) değerlerde null döner.
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  if (typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  if (!TIME_REGEX.test(trimmed)) return null;

  const parts = trimmed.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  const s = parts[2] !== undefined ? Number(parts[2]) : 0;

  if (
    !Number.isInteger(h) ||
    !Number.isInteger(m) ||
    !Number.isInteger(s) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59 ||
    s < 0 ||
    s > 59
  ) {
    return null;
  }

  return h * 60 + m;
}

/**
 * HH:mm veya HH:mm:ss biçiminde geçerli bir saat dizesi olup olmadığını doğrular.
 */
export function isValidTimeString(value: string): boolean {
  return parseTimeToMinutes(value) !== null;
}

/**
 * Dakika değerini HH:mm (veya isteğe bağlı saniye ekiyle HH:mm:ss) biçimine çevirir.
 */
export function formatMinutesToTime(totalMinutes: number, secondsSuffix?: string): string {
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}${secondsSuffix ?? ''}`;
}
