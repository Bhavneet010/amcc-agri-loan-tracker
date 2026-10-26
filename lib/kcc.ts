import { kccCrops, kccDistricts } from './kcc-sof.ts';

export type AreaUnit = 'bigha' | 'kanal' | 'metric' | 'acre' | 'hectare' | 'sqm';
export type AreaInput = { unit: AreaUnit; values: [string, string, string]; karam: '' | '66' | '57.5' };
export type KccSeasonName = 'kharif' | 'rabi' | 'longTerm';
export type KccRow = { id: string; season: KccSeasonName; cropId: string; area: AreaInput };
export type KccInput = {
  district: string;
  cultivatedAcres: string;
  totalAcres: string;
  crops: KccRow[];
};
export type KccRowResult = {
  id: string;
  season: KccSeasonName;
  label: string;
  recordedAcres: number | null;
  share: number | null;
  borrowerAcres: number | null;
  rate: number | null;
  finance: number | null;
  error: string;
};
export type KccSeasonResult = {
  used: boolean;
  rows: KccRowResult[];
  finance: number | null;
};
export type KccResult = {
  errors: string[];
  rows: KccRowResult[];
  seasons: Record<KccSeasonName, KccSeasonResult>;
  baseFinance: number | null;
  annualLimits: number[] | null;
  /** Cultivated acres left for Kharif and for Rabi crops after long-term crops. */
  seasonalAcres: number | null;
};

export const kccSeasons: { value: KccSeasonName; label: string }[] = [
  { value: 'kharif', label: 'Kharif' },
  { value: 'rabi', label: 'Rabi' },
  { value: 'longTerm', label: 'Long-term' },
];
export const seasonLabel = (season: KccSeasonName) => kccSeasons.find((option) => option.value === season)!.label;

export const kccAreaUnits: { value: AreaUnit; label: string; parts: string[] }[] = [
  { value: 'bigha', label: 'HP Bigha–Biswa–Biswansi', parts: ['Bigha', 'Biswa', 'Biswansi'] },
  { value: 'kanal', label: 'Kanal–Marla–Sarsahi', parts: ['Kanal', 'Marla', 'Sarsahi'] },
  { value: 'metric', label: 'Hectare–Are–Centiare', parts: ['Hectare', 'Are', 'Centiare (m²)'] },
  { value: 'acre', label: 'Acres', parts: ['Acres'] },
  { value: 'hectare', label: 'Hectares', parts: ['Hectares'] },
  { value: 'sqm', label: 'Square metres', parts: ['Square metres'] },
];
const showAcres = (value: number) => Number(value.toFixed(4)).toString();
const squareMetresPerAcre = 4046.8564224;
const cropsById = new Map(kccCrops.map((crop) => [crop.id, crop]));

function bounded(value: number, label: string): number {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error(`${label} is too large.`);
  return value;
}

function decimal(value: string, label: string): number {
  const text = value.trim();
  if (!text) throw new Error(`Enter ${label}.`);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) throw new Error(`${label} must be a nonnegative number.`);
  return bounded(Number(text), label);
}

/** Convert positional parts as separate units. Empty lower parts mean zero. */
export function areaInAcres(area: AreaInput): number {
  const definition = kccAreaUnits.find((unit) => unit.value === area.unit);
  if (!definition) throw new Error('Select a land area unit.');
  if (definition.parts.length === 1) {
    const amount = decimal(area.values[0], definition.parts[0].toLowerCase());
    const divisor =
      area.unit === 'hectare' ? squareMetresPerAcre / 10000 : area.unit === 'sqm' ? squareMetresPerAcre : 1;
    return bounded(amount / divisor, 'Converted area');
  }
  if (area.values.every((value) => !value.trim())) throw new Error('Enter the recorded crop area.');
  const parts = area.values.map((value, index) => {
    if (value.trim() && !/^\d+$/.test(value.trim()))
      throw new Error(`${definition.parts[index]} must be a nonnegative whole number.`);
    return decimal(value.trim() || '0', definition.parts[index]);
  });
  const middleBase = area.unit === 'metric' ? 100 : 20;
  const lowerBase = area.unit === 'metric' ? 100 : area.unit === 'kanal' ? 9 : 20;
  if (parts[1] >= middleBase || parts[2] >= lowerBase) {
    throw new Error(
      `${definition.parts[1]} must be below ${middleBase}; ${definition.parts[2]} must be below ${lowerBase}.`,
    );
  }
  if (area.unit === 'metric')
    return bounded((parts[0] * 10000 + parts[1] * 100 + parts[2]) / squareMetresPerAcre, 'Converted area');
  if (area.unit === 'bigha') return bounded((parts[0] * 400 + parts[1] * 20 + parts[2]) / 2000, 'Converted area');
  if (area.karam !== '66' && area.karam !== '57.5')
    throw new Error('Confirm the karam standard, or enter the metric Jamabandi area.');
  const sarsahi = parts[0] * 180 + parts[1] * 9 + parts[2];
  return bounded((sarsahi * (Number(area.karam) / 12) ** 2) / 43560, 'Converted area');
}

function rowResult(row: KccRow, districtIndex: number): KccRowResult {
  const crop = cropsById.get(row.cropId);
  const result: KccRowResult = {
    id: row.id,
    season: row.season,
    label: crop?.label || 'Select a crop',
    recordedAcres: null,
    share: null,
    borrowerAcres: null,
    rate: null,
    finance: null,
    error: '',
  };
  const rowErrors: string[] = [];
  if (!crop) rowErrors.push('Select a crop and condition from the suggestions.');
  try {
    result.recordedAcres = areaInAcres(row.area);
  } catch (error) {
    rowErrors.push((error as Error).message);
  }
  if (crop && districtIndex >= 0) {
    const rate = crop.rates[districtIndex];
    if (!Number.isFinite(rate) || rate < 0) rowErrors.push('No valid Scale of Finance is available for this district.');
    else result.rate = rate;
  }
  result.error = rowErrors.join(' ');
  return result;
}

/**
 * Long-term crops hold their recorded land all year, so it comes off the cultivated acres first. Kharif crops,
 * and separately Rabi crops, share what is left in proportion to their recorded areas.
 */
function allocate(rows: KccRowResult[], cultivated: number | null, districtIndex: number) {
  const errors: string[] = [];
  const longTerm = rows.filter((row) => row.season === 'longTerm');
  const longTermAcres = bounded(
    longTerm.reduce((sum, row) => sum + row.recordedAcres!, 0),
    'Long-term crop area',
  );
  if (longTerm.length && longTermAcres <= 0) errors.push('Long-term crops: recorded area must be greater than zero.');
  let seasonalAcres: number | null = null;
  if (cultivated !== null) {
    seasonalAcres = cultivated - longTermAcres;
    if (seasonalAcres < 0) {
      errors.push(
        `Long-term crops cover ${showAcres(longTermAcres)} acres, more than the ${showAcres(cultivated)} cultivated acres.`,
      );
      seasonalAcres = null;
    }
    for (const row of longTerm) row.share = row.recordedAcres! / cultivated;
  }
  for (const { value, label } of kccSeasons.slice(0, 2)) {
    const pool = rows.filter((row) => row.season === value);
    if (!pool.length) continue;
    const total = bounded(
      pool.reduce((sum, row) => sum + row.recordedAcres!, 0),
      `${label} recorded area`,
    );
    if (total <= 0) errors.push(`${label}: total recorded crop area must be greater than zero.`);
    else if (seasonalAcres === 0) errors.push(`${label}: no cultivated land is left after long-term crops.`);
    else for (const row of pool) row.share = row.recordedAcres! / total;
  }
  if (errors.length || seasonalAcres === null || districtIndex < 0) return { errors, seasonalAcres };
  for (const row of rows) {
    row.borrowerAcres = row.season === 'longTerm' ? row.recordedAcres! : row.share! * seasonalAcres;
    row.finance = bounded(row.borrowerAcres * row.rate!, 'Crop finance');
  }
  return { errors, seasonalAcres };
}

export function calculateKcc(input: KccInput): KccResult {
  const errors: string[] = [];
  const districtIndex = kccDistricts.findIndex((district) => district === input.district);
  if (districtIndex < 0) errors.push('Select a district from the FY 2026–27 rate table.');
  let cultivated: number | null = null;
  try {
    const value = decimal(input.cultivatedAcres, 'borrower cultivated acres');
    if (value <= 0) throw new Error('Borrower cultivated acres must be greater than zero.');
    cultivated = value;
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (input.totalAcres.trim()) {
    try {
      const total = decimal(input.totalAcres, 'borrower total acres');
      if (total <= 0) throw new Error('Borrower total acres must be greater than zero.');
      if (cultivated !== null && cultivated > total)
        throw new Error('Cultivated acres cannot exceed borrower total acres.');
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  if (!input.crops.length) errors.push('Add at least one Kharif, Rabi or long-term crop.');
  const rows = input.crops.map((row) => rowResult(row, districtIndex));
  let seasonalAcres: number | null = null;
  rows.forEach((row, index) => {
    if (row.error) errors.push(`Crop ${index + 1} (${seasonLabel(row.season)}): ${row.error}`);
  });
  if (!errors.length) {
    try {
      const allocation = allocate(rows, cultivated, districtIndex);
      errors.push(...allocation.errors);
      seasonalAcres = allocation.seasonalAcres;
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  const seasons = Object.fromEntries(
    kccSeasons.map(({ value, label }) => {
      const own = rows.filter((row) => row.season === value);
      let finance: number | null = 0;
      if (own.some((row) => row.finance === null)) finance = null;
      else
        finance = bounded(
          own.reduce((sum, row) => sum + row.finance!, 0),
          `${label} finance`,
        );
      return [value, { used: own.length > 0, rows: own, finance }];
    }),
  ) as Record<KccSeasonName, KccSeasonResult>;
  let baseFinance: number | null = null;
  let annualLimits: number[] | null = null;
  if (!errors.length && kccSeasons.every(({ value }) => seasons[value].finance !== null)) {
    try {
      baseFinance = bounded(
        kccSeasons.reduce((sum, { value }) => sum + seasons[value].finance!, 0),
        'Total crop finance',
      );
      const limits = [bounded(baseFinance * 1.3, 'Year 1 limit')];
      for (let year = 1; year < 5; year++) limits.push(bounded(limits[year - 1] * 1.1, `Year ${year + 1} limit`));
      annualLimits = limits;
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return { errors, rows, seasons, baseFinance, annualLimits, seasonalAcres };
}

export function blankKccRow(id: string, season: KccSeasonName): KccRow {
  return { id, season, cropId: '', area: { unit: 'bigha', values: ['', '', ''], karam: '' } };
}

export function blankKccInput(): KccInput {
  return { district: 'Sirmour', cultivatedAcres: '', totalAcres: '', crops: [] };
}

/** The workbook's saved example, including its zero-area Rabi row. */
export function kccWorkbookExample(): KccInput {
  const row = (id: string, season: KccSeasonName, cropId: string, major = '20'): KccRow => ({
    id,
    season,
    cropId,
    area: { unit: 'bigha', values: major === '0' ? ['0', '0', '0'] : [major, '12', '15'], karam: '' },
  });
  return {
    district: 'Sirmour',
    cultivatedAcres: '0.12',
    totalAcres: '',
    crops: [
      row('k-1', 'kharif', 'sof-105'),
      row('k-2', 'kharif', 'sof-92'),
      row('k-3', 'kharif', 'sof-13'),
      row('k-4', 'kharif', 'sof-13', '24'),
      row('k-5', 'kharif', 'sof-13'),
      row('k-6', 'kharif', 'sof-13'),
      row('k-7', 'kharif', 'sof-13'),
      row('r-1', 'rabi', 'sof-13'),
      row('r-2', 'rabi', 'sof-13'),
      row('r-3', 'rabi', 'sof-13'),
      row('r-4', 'rabi', 'sof-13', '0'),
      row('r-5', 'rabi', 'sof-13'),
      row('r-6', 'rabi', 'sof-13'),
      row('r-7', 'rabi', 'sof-13'),
    ],
  };
}
