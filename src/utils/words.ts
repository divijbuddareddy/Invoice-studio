// Amount-in-words helper. Uses the Indian system (lakh/crore) for INR, international otherwise.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

export function integerToWords(n: number, indian: boolean): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  if (indian) {
    const crore = Math.floor(n / 10_000_000);
    n %= 10_000_000;
    const lakh = Math.floor(n / 100_000);
    n %= 100_000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (crore) parts.push(`${integerToWords(crore, true)} Crore`);
    if (lakh) parts.push(`${below1000(lakh)} Lakh`);
    if (thousand) parts.push(`${below1000(thousand)} Thousand`);
    if (n) parts.push(below1000(n));
  } else {
    const scales: [number, string][] = [
      [1_000_000_000_000, 'Trillion'],
      [1_000_000_000, 'Billion'],
      [1_000_000, 'Million'],
      [1000, 'Thousand'],
    ];
    for (const [value, name] of scales) {
      if (n >= value) {
        parts.push(`${below1000(Math.floor(n / value))} ${name}`);
        n %= value;
      }
    }
    if (n) parts.push(below1000(n));
  }
  return parts.join(' ');
}

const NAMES: Record<string, [string, string]> = {
  INR: ['Rupees', 'Paise'],
  USD: ['US Dollars', 'Cents'],
  EUR: ['Euros', 'Cents'],
  GBP: ['Pounds Sterling', 'Pence'],
  AUD: ['Australian Dollars', 'Cents'],
  CAD: ['Canadian Dollars', 'Cents'],
  SGD: ['Singapore Dollars', 'Cents'],
  AED: ['Dirhams', 'Fils'],
};

/** e.g. 123456.5 INR → "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only" */
export function amountInWords(minor: number, currency: string, digits: number): string {
  const factor = 10 ** digits;
  const whole = Math.floor(Math.abs(minor) / factor);
  const fraction = Math.abs(minor) % factor;
  const indian = currency === 'INR';
  const [major, minorName] = NAMES[currency] ?? [currency, 'Cents'];
  let text = `${major} ${integerToWords(whole, indian)}`;
  if (fraction > 0 && digits > 0) text += ` and ${integerToWords(fraction, indian)} ${minorName}`;
  return `${text} Only`;
}
