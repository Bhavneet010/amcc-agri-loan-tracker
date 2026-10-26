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
  /** Long-term crops only: their share and acres in each season's pool. */
  seasonShares: Record<'kharif' | 'rabi', number> | null;
  seasonAcres: Record<'kharif' | 'rabi', number> | null;
  error: string;
};
export type KccSeasonResult = {
  used: boolean;
  rows: KccRowResult[];
  /** Kharif and Rabi include half of each long-term crop's finance; long-term shows the crops' full total. */
  finance: number | null;
};
export type KccResult = {
  errors: string[];
  rows: KccRowResult[];
  seasons: Record<KccSeasonName, KccSeasonResult>;
  baseFinance: number | null;
  annualLimits: number[] | null;
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
    seasonShares: row.season === 'longTerm' ? { kharif: 0, rabi: 0 } : null,
    seasonAcres: row.season === 'longTerm' ? { kharif: 0, rabi: 0 } : null,
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
 * Mirrors the workbook: within a season, recorded areas only set each crop's share, and the shares split the
 * borrower's cultivated acres. A long-term crop stands on its land all year, so it joins both the Kharif and the
 * Rabi pool at its full recorded area, and half of its annual Scale of Finance is counted in each season.
 */
function allocate(rows: KccRowResult[], cultivated: number | null, districtIndex: number) {
  const errors: string[] = [];
  const pools = kccSeasons.slice(0, 2).map(({ value, label }) => {
    const pool = rows.filter((row) => row.season === value || row.season === 'longTerm');
    const total = bounded(
      pool.reduce((sum, row) => sum + row.recordedAcres!, 0),
      `${label} recorded area`,
    );
    if (pool.length && total <= 0) errors.push(`${label}: total recorded crop area must be greater than zero.`);
    return { season: value as 'kharif' | 'rabi', pool, total };
  });
  if (errors.length || cultivated === null) return errors;
  for (const { season, pool, total } of pools) {
    for (const row of pool) {
      const share = row.recordedAcres! / total;
      const acres = share * cultivated;
      if (row.season !== 'longTerm') {
        row.share = share;
        row.borrowerAcres = acres;
      } else {
        row.seasonShares = { ...row.seasonShares!, [season]: share };
        row.seasonAcres = { ...row.seasonAcres!, [season]: acres };
      }
    }
  }
  if (districtIndex < 0) return errors;
  for (const row of rows) {
    if (row.season === 'longTerm') {
      // An average of the two seasons' acres, so acres × annual rate equals the two half-rate season amounts.
      row.borrowerAcres = (row.seasonAcres!.kharif + row.seasonAcres!.rabi) / 2;
      row.share = (row.seasonShares!.kharif + row.seasonShares!.rabi) / 2;
    }
    row.finance = bounded(row.borrowerAcres! * row.rate!, 'Crop finance');
  }
  return errors;
}

/** Problems with one crop entry on its own (crop, area and district rate), or '' when it can be added. */
export function kccRowError(row: KccRow, district: string): string {
  return rowResult(
    row,
    kccDistricts.findIndex((name) => name === district),
  ).error;
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
  rows.forEach((row, index) => {
    if (row.error) errors.push(`Crop ${index + 1} (${seasonLabel(row.season)}): ${row.error}`);
  });
  if (!errors.length) {
    try {
      errors.push(...allocate(rows, cultivated, districtIndex));
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  const longTerm = rows.filter((row) => row.season === 'longTerm');
  const seasons = Object.fromEntries(
    kccSeasons.map(({ value, label }) => {
      const own = rows.filter((row) => row.season === value);
      const counted = value === 'longTerm' ? own : [...own, ...longTerm];
      let finance: number | null = null;
      if (counted.every((row) => row.finance !== null))
        finance = bounded(
          own.reduce((sum, row) => sum + row.finance!, 0) +
            (value === 'longTerm'
              ? 0
              : longTerm.reduce((sum, row) => sum + (row.seasonAcres![value] * row.rate!) / 2, 0)),
          `${label} finance`,
        );
      return [value, { used: counted.length > 0, rows: own, finance }];
    }),
  ) as Record<KccSeasonName, KccSeasonResult>;
  let baseFinance: number | null = null;
  let annualLimits: number[] | null = null;
  if (!errors.length && seasons.kharif.finance !== null && seasons.rabi.finance !== null) {
    try {
      baseFinance = bounded(seasons.kharif.finance + seasons.rabi.finance, 'Total crop finance');
      const limits = [bounded(baseFinance * 1.3, 'Year 1 limit')];
      for (let year = 1; year < 5; year++) limits.push(bounded(limits[year - 1] * 1.1, `Year ${year + 1} limit`));
      annualLimits = limits;
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return { errors, rows, seasons, baseFinance, annualLimits };
}

/** Short decimal text for a stored area, without float noise or trailing zeros. */
function decimalText(value: number, places: number): string {
  const text = value.toFixed(places).replace(/\.?0+$/, '');
  return text === '' || text === '-0' ? '0' : text;
}

/**
 * Writes an acre figure back in the unit the crop card already uses. Positional units are rounded to their smallest
 * part (biswansi, sarsahi or centiare), so the stored area stays a valid Jamabandi-style entry.
 */
export function acresToArea(acres: number, area: AreaInput): AreaInput {
  if (!Number.isFinite(acres) || acres < 0) throw new Error('Acres must be a nonnegative number.');
  const decimalOnly = (text: string): AreaInput => ({ ...area, values: [text, '', ''] });
  if (area.unit === 'acre') return decimalOnly(decimalText(acres, 6));
  if (area.unit === 'hectare') return decimalOnly(decimalText((acres * squareMetresPerAcre) / 10000, 6));
  if (area.unit === 'sqm') return decimalOnly(decimalText(acres * squareMetresPerAcre, 2));
  let smallest: number;
  let middleBase: number;
  let lowerBase: number;
  if (area.unit === 'bigha') {
    smallest = Math.round(acres * 2000);
    [middleBase, lowerBase] = [20, 20];
  } else if (area.unit === 'metric') {
    smallest = Math.round(acres * squareMetresPerAcre);
    [middleBase, lowerBase] = [100, 100];
  } else {
    if (area.karam !== '66' && area.karam !== '57.5')
      throw new Error('Confirm the karam standard on this crop before changing its acres.');
    smallest = Math.round((acres * 43560) / (Number(area.karam) / 12) ** 2);
    [middleBase, lowerBase] = [20, 9];
  }
  const lower = smallest % lowerBase;
  const middle = Math.floor(smallest / lowerBase) % middleBase;
  const major = Math.floor(smallest / (lowerBase * middleBase));
  return { ...area, values: [String(major), String(middle), String(lower)] };
}

/**
 * Sets one Kharif or Rabi crop to a chosen number of borrower acres. The other crops of that season share what is
 * left of the cultivated land in their existing proportion; long-term crops in the season keep their acres. Every
 * crop of the season whose area changes is written back in its own unit.
 *
 * When the season has no long-term crop, the season's areas are rewritten as the borrower's acres themselves, so a
 * crop card shows the acres entered. With a long-term crop, that crop also sits in the other season's pool, so the
 * season keeps its recorded-area scale and the long-term crop and the other season stay untouched.
 */
export function setCropAcres(input: KccInput, rowId: string, acres: number): KccInput {
  const target = input.crops.find((row) => row.id === rowId);
  if (!target) throw new Error('That crop is no longer in the list.');
  if (target.season === 'longTerm')
    throw new Error('Long-term crops sit in both seasons; change their area in the crop card.');
  if (!Number.isFinite(acres) || acres < 0) throw new Error('Enter acres as a nonnegative number.');
  const result = calculateKcc(input);
  const cultivated = Number(input.cultivatedAcres.trim());
  if (!Number.isFinite(cultivated) || cultivated <= 0 || result.rows.some((row) => row.recordedAcres === null))
    throw new Error('Complete the cultivated land and every crop card before changing acres here.');
  const season = target.season;
  const byId = new Map(result.rows.map((row) => [row.id, row]));
  const longTerm = result.rows.filter((row) => row.season === 'longTerm');
  const others = input.crops.filter((row) => row.season === season && row.id !== rowId);
  const longTermAcres = longTerm.reduce((sum, row) => sum + (row.seasonAcres?.[season] ?? 0), 0);
  const available = cultivated - longTermAcres;
  const label = seasonLabel(season);
  if (acres > available + 1e-9)
    throw new Error(
      `${label} crops can share at most ${available.toFixed(2)} acres${longTerm.length ? ' after long-term crops' : ''}.`,
    );
  if (!others.length && !longTerm.length && Math.abs(acres - cultivated) > 1e-9)
    throw new Error(
      `This is the only ${label} crop, so it takes all cultivated land. Change the cultivated land instead.`,
    );
  const remaining = Math.max(0, available - acres);
  const otherRecorded = others.reduce((sum, row) => sum + byId.get(row.id)!.recordedAcres!, 0);
  if (!others.length && remaining > 1e-9)
    throw new Error(`Another ${label} crop or the long-term crops must take the other ${remaining.toFixed(2)} acres.`);
  const otherAcres = new Map(
    others.map((row) => [
      row.id,
      otherRecorded > 0 ? (byId.get(row.id)!.recordedAcres! / otherRecorded) * remaining : remaining / others.length,
    ]),
  );
  // Recorded-area units per borrower acre for this season: 1 when it can be rewritten in acres, otherwise the
  // season's existing recorded total over cultivated land, which leaves long-term crops' shares unchanged.
  const scale = longTerm.length
    ? result.rows
        .filter((row) => row.season === season || row.season === 'longTerm')
        .reduce((sum, row) => sum + row.recordedAcres!, 0) / cultivated
    : 1;
  return {
    ...input,
    crops: input.crops.map((row) => {
      if (row.id === rowId) return { ...row, area: acresToArea(acres * scale, row.area) };
      const share = otherAcres.get(row.id);
      return share === undefined ? row : { ...row, area: acresToArea(share * scale, row.area) };
    }),
  };
}

export function blankKccRow(id: string, season: KccSeasonName): KccRow {
  return { id, season, cropId: '', area: { unit: 'bigha', values: ['', '', ''], karam: '' } };
}

export function blankKccInput(): KccInput {
  return { district: 'Sirmour', cultivatedAcres: '', totalAcres: '', crops: [] };
}

/**
 * Reads calculator inputs saved in the browser. Anything malformed falls back to a blank field, and a crop entry
 * that is not shaped like one is dropped, so an old or edited saved copy can never break the calculator.
 */
export function parseSavedKccInput(text: string | null): KccInput | null {
  let saved: unknown;
  try {
    saved = JSON.parse(text || '');
  } catch {
    return null;
  }
  if (!saved || typeof saved !== 'object') return null;
  const value = saved as Record<string, unknown>;
  const textOf = (field: unknown) => (typeof field === 'string' ? field : '');
  const blank = blankKccInput();
  const crops = (Array.isArray(value.crops) ? value.crops : []).flatMap((entry): KccRow[] => {
    const row = (entry || {}) as Record<string, unknown>;
    const area = (row.area || {}) as Record<string, unknown>;
    const values = Array.isArray(area.values) ? area.values : [];
    if (
      typeof row.id !== 'string' ||
      !kccSeasons.some((season) => season.value === row.season) ||
      !kccAreaUnits.some((unit) => unit.value === area.unit)
    )
      return [];
    return [
      {
        id: row.id,
        season: row.season as KccSeasonName,
        cropId: textOf(row.cropId),
        area: {
          unit: area.unit as AreaUnit,
          values: [textOf(values[0]), textOf(values[1]), textOf(values[2])],
          karam: area.karam === '66' || area.karam === '57.5' ? area.karam : '',
        },
      },
    ];
  });
  return {
    district: kccDistricts.some((district) => district === value.district)
      ? (value.district as string)
      : blank.district,
    cultivatedAcres: textOf(value.cultivatedAcres),
    totalAcres: textOf(value.totalAcres),
    crops,
  };
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
