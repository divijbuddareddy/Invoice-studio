// Decimal-safe money helpers. All calculations run on integer minor units
// (paise, cents); conversion to/from user-entered major units happens at the edges.

export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'SAR', name: 'Saudi Riyal' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'BDT', name: 'Bangladeshi Taka' },
  { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'NPR', name: 'Nepalese Rupee' },
];

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for an ISO currency (INR 2, JPY 0, ...). */
export function currencyDigits(currency: string): number {
  const cached = digitsCache.get(currency);
  if (cached !== undefined) return cached;
  let digits = 2;
  try {
    digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  digitsCache.set(currency, digits);
  return digits;
}

/** Round half away from zero, tolerant of binary floating-point noise (e.g. 1.005). */
export function roundHalf(value: number): number {
  const fixed = Number(value.toFixed(8));
  return Math.sign(fixed) * Math.round(Math.abs(fixed));
}

export function toMinor(major: number, currency: string): number {
  if (!Number.isFinite(major)) return 0;
  return roundHalf(major * 10 ** currencyDigits(currency));
}

export function fromMinor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency);
}

function localeFor(currency: string): string {
  return currency === 'INR' ? 'en-IN' : 'en-US';
}

/** Format minor units as a plain number with grouping (no symbol). */
export function formatNumber(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  return new Intl.NumberFormat(localeFor(currency), { minimumFractionDigits: d, maximumFractionDigits: d }).format(
    fromMinor(minor, currency),
  );
}

/** UI formatting with currency symbol. */
export function formatMoney(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  try {
    return new Intl.NumberFormat(localeFor(currency), {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(fromMinor(minor, currency));
  } catch {
    return `${currency} ${formatNumber(minor, currency)}`;
  }
}

/** PDF formatting uses the ISO code (built-in PDF fonts cannot render every currency symbol). */
export function formatMoneyCode(minor: number, currency: string): string {
  const sign = minor < 0 ? '-' : '';
  return `${sign}${currency} ${formatNumber(Math.abs(minor), currency)}`;
}

/** Parse user input like "1,234.50" safely; returns 0 for invalid input. */
export function parseAmount(input: string | number): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  const n = Number(String(input).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
