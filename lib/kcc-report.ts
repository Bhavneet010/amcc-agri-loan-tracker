import { calculateKcc, kccAreaUnits, seasonLabel, type AreaInput, type KccInput } from './kcc.ts';

/**
 * The KCC calculation laid out as plain text for the PDF export. Kept free of any PDF library so it can be tested.
 * Amounts use the ₹ sign with Indian digit grouping; "Rs." is used only when the PDF has to fall back to a built-in
 * font, which has no ₹ glyph.
 */
const amount = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const wholeAmount = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const acreFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const reportMoney = (value: number | null, symbol = '₹') =>
  value === null ? '-' : `${symbol === '₹' ? '₹' : `${symbol} `}${amount.format(value)}`;
const reportWholeMoney = (value: number | null, symbol: string) =>
  value === null ? '-' : `${symbol === '₹' ? '₹' : `${symbol} `}${wholeAmount.format(value)}`;
const showAcres = (value: number | null) => (value === null ? '-' : acreFormat.format(value));

/** Drop the workbook's condition after its separator, while preserving hyphens inside crop names. */
export function cropNameBeforeCondition(label: string) {
  return label.split(/\s*[–—]\s*|\s+-\s+/u, 1)[0]?.trim() || label;
}

/** The recorded area as entered on the crop card, e.g. "2 Bigha 3 Biswa 0 Biswansi". */
export function areaText(area: AreaInput) {
  const unit = kccAreaUnits.find((option) => option.value === area.unit);
  if (!unit) return '-';
  if (unit.parts.length === 1) return `${area.values[0].trim() || '0'} ${unit.parts[0].toLowerCase()}`;
  const text = unit.parts.map((part, index) => `${area.values[index].trim() || '0'} ${part}`).join(' ');
  return area.unit === 'kanal' && area.karam ? `${text} (karam ${area.karam} in)` : text;
}

/** Space-saving label for the PDF's recorded-area column. The column heading supplies the positional unit order. */
export function compactAreaText(area: AreaInput) {
  const unit = kccAreaUnits.find((option) => option.value === area.unit);
  if (!unit) return '-';
  if (unit.parts.length === 1) return `${area.values[0].trim() || '0'} ${unit.parts[0].toLowerCase()}`;
  const values = unit.parts.map((_, index) => area.values[index].trim() || '0').join('-');
  if (area.unit === 'kanal') return `${values} K-M-S${area.karam ? ` (${area.karam} in)` : ''}`;
  if (area.unit === 'metric') return `${values} Ha-A-Ca`;
  return values;
}

export type KccReport = {
  ready: boolean;
  errors: string[];
  details: [string, string][];
  crops: string[][];
  seasons: [string, string][];
  totalFinance: string;
  schedule: [string, string][];
  yearOne: string;
  mpl: string;
};

export function kccReport(input: KccInput, borrower = '', symbol = '₹'): KccReport {
  const money = (value: number | null) => reportMoney(value, symbol);
  const cropMoney = (value: number | null) => reportWholeMoney(value, symbol);
  const result = calculateKcc(input);
  const details: [string, string][] = [];
  if (borrower.trim()) details.push(['Borrower', borrower.trim()]);
  details.push(['District', input.district]);
  details.push(['Cultivated land', `${input.cultivatedAcres.trim() || '-'} acres`]);
  if (input.totalAcres.trim()) details.push(['Total land', `${input.totalAcres.trim()} acres`]);
  const crops = input.crops.map((row, index) => {
    const line = result.rows[index];
    return [
      String(index + 1),
      seasonLabel(row.season),
      cropNameBeforeCondition(line?.label ?? '-'),
      compactAreaText(row.area),
      showAcres(line?.borrowerAcres ?? null),
      cropMoney(line?.rate ?? null),
      cropMoney(line?.finance ?? null),
    ];
  });
  const seasons = (['kharif', 'rabi', 'longTerm'] as const)
    .filter((season) => result.seasons[season].used)
    .map((season) => [`${seasonLabel(season)} finance`, money(result.seasons[season].finance)] as [string, string]);
  const limits = result.annualLimits;
  return {
    ready: !!limits,
    errors: result.errors,
    details,
    crops,
    seasons,
    totalFinance: money(result.baseFinance),
    schedule: [1, 2, 3, 4, 5].map((year) => [
      year === 5 ? 'Year 5 (MPL)' : `Year ${year}`,
      money(limits?.[year - 1] ?? null),
    ]),
    yearOne: money(limits?.[0] ?? null),
    mpl: money(limits?.[4] ?? null),
  };
}

/** A file name such as "KCC-Ram-Singh-2026-11-03.pdf". */
export function kccFileName(borrower: string, now: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const name = borrower
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `KCC-${name ? `${name}-` : ''}${day}.pdf`;
}
