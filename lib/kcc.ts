import { kccCrops, kccDistricts } from './kcc-sof.ts';

export type AreaUnit = 'bigha' | 'kanal' | 'metric' | 'acre' | 'hectare' | 'sqm';
export type AreaInput = { unit: AreaUnit; values: [string, string, string]; karam: '' | '66' | '57.5' };
export type KccRow = { id: string; cropId: string; area: AreaInput };
export type KccSeason = { enabled: boolean; rows: KccRow[] };
export type KccInput = {
  district: string;
  cultivatedAcres: string;
  totalAcres: string;
  kharif: KccSeason;
  rabi: KccSeason;
};
export type KccRowResult = {
  id: string;
  label: string;
  recordedAcres: number | null;
  share: number | null;
  borrowerAcres: number | null;
  rate: number | null;
  finance: number | null;
  error: string;
};
export type KccSeasonResult = {
  enabled: boolean;
  rows: KccRowResult[];
  recordedAcres: number | null;
  finance: number | null;
  errors: string[];
};
export type KccResult = {
  errors: string[];
  kharif: KccSeasonResult;
  rabi: KccSeasonResult;
  baseFinance: number | null;
  annualLimits: number[] | null;
};

export const kccAreaUnits: { value: AreaUnit; label: string; parts: string[] }[] = [
  { value: 'bigha', label: 'HP Bigha–Biswa–Biswansi', parts: ['Bigha', 'Biswa', 'Biswansi'] },
  { value: 'kanal', label: 'Kanal–Marla–Sarsahi', parts: ['Kanal', 'Marla', 'Sarsahi'] },
  { value: 'metric', label: 'Hectare–Are–Centiare', parts: ['Hectare', 'Are', 'Centiare (m²)'] },
  { value: 'acre', label: 'Acres', parts: ['Acres'] },
  { value: 'hectare', label: 'Hectares', parts: ['Hectares'] },
  { value: 'sqm', label: 'Square metres', parts: ['Square metres'] },
];
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

function seasonResult(
  season: KccSeason,
  name: string,
  cultivated: number | null,
  districtIndex: number,
): KccSeasonResult {
  if (!season.enabled) return { enabled: false, rows: [], recordedAcres: 0, finance: 0, errors: [] };
  const errors: string[] = [];
  const rows: KccRowResult[] = season.rows.map((row, index) => {
    const crop = cropsById.get(row.cropId);
    const result: KccRowResult = {
      id: row.id,
      label: crop?.label || 'Select a crop',
      recordedAcres: null,
      share: null,
      borrowerAcres: null,
      rate: null,
      finance: null,
      error: '',
    };
    const rowErrors: string[] = [];
    if (!crop) rowErrors.push('Select a crop and condition.');
    try {
      result.recordedAcres = areaInAcres(row.area);
    } catch (error) {
      rowErrors.push((error as Error).message);
    }
    if (crop && districtIndex >= 0) {
      const rate = crop.rates[districtIndex];
      if (!Number.isFinite(rate) || rate < 0)
        rowErrors.push('No valid Scale of Finance is available for this district.');
      else result.rate = rate;
    }
    result.error = rowErrors.join(' ');
    if (result.error) errors.push(`${name} crop ${index + 1}: ${result.error}`);
    return result;
  });
  if (!rows.length) errors.push(`${name}: add a crop, or switch this season off.`);
  let recordedAcres: number | null = null;
  let finance: number | null = null;
  if (!errors.length) {
    try {
      recordedAcres = bounded(
        rows.reduce((sum, row) => sum + row.recordedAcres!, 0),
        `${name} recorded area`,
      );
      if (recordedAcres <= 0) throw new Error(`${name}: total recorded crop area must be greater than zero.`);
      if (cultivated !== null && districtIndex >= 0) {
        for (const row of rows) {
          row.share = row.recordedAcres! / recordedAcres;
          row.borrowerAcres = row.share * cultivated;
          row.finance = bounded(row.borrowerAcres * row.rate!, `${name} crop finance`);
        }
        finance = bounded(
          rows.reduce((sum, row) => sum + row.finance!, 0),
          `${name} finance`,
        );
      }
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return { enabled: true, rows, recordedAcres, finance: errors.length ? null : finance, errors };
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
  if (!input.kharif.enabled && !input.rabi.enabled) errors.push('Enable at least one cropping season.');
  const kharif = seasonResult(input.kharif, 'Kharif', cultivated, districtIndex);
  const rabi = seasonResult(input.rabi, 'Rabi', cultivated, districtIndex);
  errors.push(...kharif.errors, ...rabi.errors);
  let baseFinance: number | null = null;
  let annualLimits: number[] | null = null;
  if (!errors.length && kharif.finance !== null && rabi.finance !== null) {
    try {
      baseFinance = bounded(kharif.finance + rabi.finance, 'Total crop finance');
      const limits = [bounded(baseFinance * 1.3, 'Year 1 limit')];
      for (let year = 1; year < 5; year++) limits.push(bounded(limits[year - 1] * 1.1, `Year ${year + 1} limit`));
      annualLimits = limits;
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return { errors, kharif, rabi, baseFinance, annualLimits };
}

export function blankKccRow(id: string): KccRow {
  return { id, cropId: '', area: { unit: 'bigha', values: ['', '', ''], karam: '' } };
}

export function blankKccInput(): KccInput {
  return {
    district: 'Sirmour',
    cultivatedAcres: '',
    totalAcres: '',
    kharif: { enabled: true, rows: [blankKccRow('kharif-1')] },
    rabi: { enabled: true, rows: [blankKccRow('rabi-1')] },
  };
}

/** The workbook's saved example, including its zero-area Rabi row. */
export function kccWorkbookExample(): KccInput {
  const row = (id: string, cropId: string, major = '20'): KccRow => ({
    id,
    cropId,
    area: { unit: 'bigha', values: major === '0' ? ['0', '0', '0'] : [major, '12', '15'], karam: '' },
  });
  return {
    district: 'Sirmour',
    cultivatedAcres: '0.12',
    totalAcres: '',
    kharif: {
      enabled: true,
      rows: [
        row('k-1', 'sof-105'),
        row('k-2', 'sof-92'),
        row('k-3', 'sof-13'),
        row('k-4', 'sof-13', '24'),
        row('k-5', 'sof-13'),
        row('k-6', 'sof-13'),
        row('k-7', 'sof-13'),
      ],
    },
    rabi: {
      enabled: true,
      rows: [
        row('r-1', 'sof-13'),
        row('r-2', 'sof-13'),
        row('r-3', 'sof-13'),
        row('r-4', 'sof-13', '0'),
        row('r-5', 'sof-13'),
        row('r-6', 'sof-13'),
        row('r-7', 'sof-13'),
      ],
    },
  };
}
