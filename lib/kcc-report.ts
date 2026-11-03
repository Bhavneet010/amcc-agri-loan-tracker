import { calculateKcc, kccAreaUnits, seasonLabel, type AreaInput, type KccInput } from './kcc.ts';

/**
 * The KCC calculation laid out as plain text for the PDF export. Kept free of any PDF library so it can be tested.
 * The built-in PDF fonts have no ₹ glyph, so amounts are written as "Rs." with Indian digit grouping.
 */
const amount = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const acreFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const reportMoney = (value: number | null) => (value === null ? '-' : `Rs. ${amount.format(value)}`);
const showAcres = (value: number | null) => (value === null ? '-' : acreFormat.format(value));

/** The recorded area as entered on the crop card, e.g. "2 Bigha 3 Biswa 0 Biswansi". */
export function areaText(area: AreaInput) {
  const unit = kccAreaUnits.find((option) => option.value === area.unit);
  if (!unit) return '-';
  if (unit.parts.length === 1) return `${area.values[0].trim() || '0'} ${unit.parts[0].toLowerCase()}`;
  const text = unit.parts.map((part, index) => `${area.values[index].trim() || '0'} ${part}`).join(' ');
  return area.unit === 'kanal' && area.karam ? `${text} (karam ${area.karam} in)` : text;
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

export function kccReport(input: KccInput, borrower = ''): KccReport {
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
      line?.label ?? '-',
      areaText(row.area),
      showAcres(line?.borrowerAcres ?? null),
      reportMoney(line?.rate ?? null),
      reportMoney(line?.finance ?? null),
    ];
  });
  const seasons = (['kharif', 'rabi', 'longTerm'] as const)
    .filter((season) => result.seasons[season].used)
    .map(
      (season) => [`${seasonLabel(season)} finance`, reportMoney(result.seasons[season].finance)] as [string, string],
    );
  const limits = result.annualLimits;
  return {
    ready: !!limits,
    errors: result.errors,
    details,
    crops,
    seasons,
    totalFinance: reportMoney(result.baseFinance),
    schedule: [1, 2, 3, 4, 5].map((year) => [
      year === 5 ? 'Year 5 (MPL)' : `Year ${year}`,
      reportMoney(limits?.[year - 1] ?? null),
    ]),
    yearOne: reportMoney(limits?.[0] ?? null),
    mpl: reportMoney(limits?.[4] ?? null),
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
