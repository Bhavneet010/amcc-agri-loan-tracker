import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  areaInAcres,
  blankKccInput,
  calculateKcc,
  kccWorkbookExample,
  parseSavedKccInput,
  type AreaInput,
} from '../lib/kcc.ts';
import { kccCrops, kccDistricts } from '../lib/kcc-sof.ts';

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const area = (unit: AreaInput['unit'], values: AreaInput['values'], karam: AreaInput['karam'] = ''): AreaInput => ({
  unit,
  values,
  karam,
});

test('reproduces the workbook allocation and all five cached annual limits', () => {
  const result = calculateKcc(kccWorkbookExample());
  assert.deepEqual(result.errors, []);
  close(result.seasons.kharif.finance!, 13164.557837837836);
  close(result.seasons.rabi.finance!, 5871.6);
  assert.equal(result.seasons.longTerm.used, false);
  [24747.005189189182, 27221.705708108104, 29943.876278918917, 32938.263906810811, 36232.090297491894].forEach((v, i) =>
    close(result.annualLimits![i], v),
  );
  close(
    result.seasons.kharif.rows.reduce((sum, row) => sum + row.borrowerAcres!, 0),
    0.12,
  );
  close(
    result.seasons.rabi.rows.reduce((sum, row) => sum + row.borrowerAcres!, 0),
    0.12,
  );
  close(result.rows[0].recordedAcres!, 4.1275);
  assert.deepEqual(
    result.rows.map((row) => row.id),
    kccWorkbookExample().crops.map((row) => row.id),
  );
});

test('converts HP positional areas without treating them as decimal notation', () => {
  close(areaInAcres(area('bigha', ['2', '13', '10'])), 0.535);
  close(areaInAcres(area('bigha', ['123', '0', '0'])), 24.6);
  close(areaInAcres(area('kanal', ['1', '0', '0'], '66')), 0.125);
  close(areaInAcres(area('kanal', ['0', '0', '1'], '66')), 0.0006944444444444445);
  close(areaInAcres(area('kanal', ['1', '0', '0'], '57.5')), 0.09487632059228651);
});

test('keeps exact decimal bigha conversions clean when copied to the borrower input', () => {
  assert.equal(areaInAcres(area('bigha', ['2', '13', '10'])), 0.535);
  assert.equal(areaInAcres(area('bigha', ['20', '12', '15'])), 4.1275);
});

test('converts metric and decimal areas on the same acre basis', () => {
  close(areaInAcres(area('acre', ['1', '', ''])), 1);
  close(areaInAcres(area('hectare', ['0.40468564224', '', ''])), 1);
  close(areaInAcres(area('sqm', ['4046.8564224', '', ''])), 1);
  close(areaInAcres(area('metric', ['0', '40', '46'])), 0.9997883733758367);
  close(areaInAcres(area('bigha', ['2', '', ''])), 0.4);
});

test('rejects unconfirmed karam and invalid positional components', () => {
  for (const input of [
    area('kanal', ['1', '0', '0']),
    area('bigha', ['2', '20', '0']),
    area('bigha', ['2', '0', '20']),
    area('bigha', ['2.5', '0', '0']),
    area('kanal', ['1', '0', '9'], '66'),
    area('metric', ['0', '100', '0']),
  ]) {
    assert.throws(() => areaInAcres(input));
  }
});

test('missing, negative, malformed and overflowing areas never produce finance', () => {
  for (const value of ['', '-1', 'Infinity', 'NaN', '1e309', '1,000', 'abc', '9'.repeat(310)]) {
    const input = kccWorkbookExample();
    input.crops[0].area = area('acre', [value, '', '']);
    const result = calculateKcc(input);
    assert.ok(result.errors.length > 0, value);
    assert.equal(result.annualLimits, null);
  }
});

test('uses district-specific finance rates and rejects unknown crop or district', () => {
  const input = kccWorkbookExample();
  input.cultivatedAcres = '1';
  input.crops = [{ id: 'horse', season: 'kharif', cropId: 'sof-22', area: area('acre', ['1', '', '']) }];
  input.district = 'Bilaspur';
  close(calculateKcc(input).annualLimits![0], 10539.1);
  input.district = 'Sirmour';
  close(calculateKcc(input).annualLimits![0], 10553.4);
  input.district = 'Invalid district';
  assert.equal(calculateKcc(input).annualLimits, null);
  input.district = 'Sirmour';
  input.crops[0].cropId = 'unknown';
  assert.equal(calculateKcc(input).annualLimits, null);
});

test('seasons without crops are excluded and draft crops block the limit', () => {
  const input = kccWorkbookExample();
  input.crops.find((row) => row.season === 'rabi')!.cropId = '';
  assert.equal(calculateKcc(input).annualLimits, null);
  input.crops = input.crops.filter((row) => row.season !== 'rabi');
  const result = calculateKcc(input);
  assert.equal(result.seasons.rabi.used, false);
  close(result.annualLimits![0], 17113.925189189188);
  input.crops = [];
  assert.equal(calculateKcc(input).annualLimits, null);
});

test('long-term crops join both seasons at full recorded area with half their finance in each', () => {
  const input = kccWorkbookExample();
  input.cultivatedAcres = '2';
  input.crops = [
    { id: 'k', season: 'kharif', cropId: 'sof-22', area: area('acre', ['1', '', '']) },
    { id: 'r1', season: 'rabi', cropId: 'sof-2', area: area('acre', ['2', '', '']) },
    { id: 'r2', season: 'rabi', cropId: 'sof-3', area: area('acre', ['1', '', '']) },
    { id: 'a', season: 'longTerm', cropId: 'sof-87', area: area('acre', ['1', '', '']) },
  ];
  const result = calculateKcc(input);
  assert.deepEqual(result.errors, []);
  const sirmour = kccDistricts.indexOf('Sirmour');
  const rate = (id: string) => kccCrops.find((crop) => crop.id === id)!.rates[sirmour];
  const [kharif, wheat, wheatUn, apple] = result.rows;
  // Kharif pool: crop 1 + orchard 1 → 1/2 each. Rabi pool: 2 + 1 + orchard 1 → 1/2, 1/4, 1/4.
  close(kharif.borrowerAcres!, 1);
  close(wheat.borrowerAcres!, 1);
  close(wheatUn.borrowerAcres!, 0.5);
  close(apple.seasonAcres!.kharif, 1);
  close(apple.seasonAcres!.rabi, 0.5);
  close(apple.borrowerAcres!, 0.75);
  close(result.seasons.longTerm.finance!, 0.75 * rate('sof-87'));
  close(result.seasons.kharif.finance!, rate('sof-22') + rate('sof-87') / 2);
  close(result.seasons.rabi.finance!, rate('sof-2') + 0.5 * rate('sof-3') + 0.25 * rate('sof-87'));
  close(result.baseFinance!, rate('sof-22') + rate('sof-2') + 0.5 * rate('sof-3') + 0.75 * rate('sof-87'));
  close(result.annualLimits![0], result.baseFinance! * 1.3);
});

test('long-term areas are ratios like the workbook, not acres taken off the cultivated land', () => {
  const input = kccWorkbookExample();
  input.crops.find((row) => row.id === 'k-1')!.season = 'longTerm';
  const result = calculateKcc(input);
  assert.deepEqual(result.errors, []);
  for (const season of ['kharif', 'rabi'] as const) {
    const own = result.rows.filter((row) => row.season === season);
    close(own.reduce((sum, row) => sum + row.borrowerAcres!, 0) + result.rows[0].seasonAcres![season], 0.12);
  }
});

test('long-term crops alone take the whole cultivated land in both seasons', () => {
  const input = kccWorkbookExample();
  input.cultivatedAcres = '1';
  input.crops = [{ id: 'a', season: 'longTerm', cropId: 'sof-87', area: area('bigha', ['5', '', '']) }];
  const alone = calculateKcc(input);
  assert.deepEqual(alone.errors, []);
  close(alone.rows[0].borrowerAcres!, 1);
  assert.equal(alone.seasons.kharif.used, true);
  close(alone.seasons.kharif.finance!, alone.seasons.rabi.finance!);
  close(alone.baseFinance!, alone.rows[0].rate!);
});

test('empty or zero-area crop lists cannot silently show a zero limit', () => {
  const input = kccWorkbookExample();
  input.crops = [{ id: 'zero', season: 'kharif', cropId: 'sof-13', area: area('acre', ['0', '', '']) }];
  assert.equal(calculateKcc(input).annualLimits, null);
  assert.equal(calculateKcc(blankKccInput()).annualLimits, null);
});

test('validates positive borrower acreage and optional total land', () => {
  for (const value of ['', '0', '-1', 'Infinity', '9'.repeat(20)]) {
    const input = kccWorkbookExample();
    input.cultivatedAcres = value;
    assert.equal(calculateKcc(input).annualLimits, null);
  }
  const input = kccWorkbookExample();
  input.totalAcres = '0.1';
  assert.equal(calculateKcc(input).annualLimits, null);
  input.totalAcres = '0.12';
  assert.ok(calculateKcc(input).annualLimits);
});

test('crop catalog keeps unique source-row identities and every district rate usable', () => {
  assert.equal(kccCrops.length, 175);
  assert.equal(kccDistricts.length, 12);
  assert.equal(new Set(kccCrops.map((crop) => crop.id)).size, 175);
  for (const crop of kccCrops) {
    assert.equal(crop.rates.length, 12);
    assert.ok(crop.rates.every((rate) => Number.isFinite(rate) && rate >= 0));
  }
});

test('saved calculator inputs round-trip and malformed copies fall back safely', () => {
  const input = kccWorkbookExample();
  assert.deepEqual(parseSavedKccInput(JSON.stringify(input)), input);
  for (const text of [null, '', 'not json', '42', 'null']) assert.equal(parseSavedKccInput(text), null);
  const damaged = parseSavedKccInput(
    JSON.stringify({
      district: 'Nowhere',
      cultivatedAcres: 3,
      crops: [
        { id: 'ok', season: 'rabi', cropId: 'sof-2', area: { unit: 'acre', values: ['1'], karam: 'x' } },
        { id: 'bad-season', season: 'summer', cropId: 'sof-2', area: { unit: 'acre', values: ['1', '', ''] } },
        { season: 'rabi', cropId: 'sof-2', area: { unit: 'acre', values: ['1', '', ''] } },
        null,
      ],
    }),
  )!;
  assert.equal(damaged.district, blankKccInput().district);
  assert.equal(damaged.cultivatedAcres, '');
  assert.deepEqual(damaged.crops, [
    { id: 'ok', season: 'rabi', cropId: 'sof-2', area: { unit: 'acre', values: ['1', '', ''], karam: '' } },
  ]);
});
