import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaInAcres, blankKccInput, calculateKcc, kccWorkbookExample, type AreaInput } from '../lib/kcc.ts';
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
  close(result.kharif.finance!, 13164.557837837836);
  close(result.rabi.finance!, 5871.6);
  [24747.005189189182, 27221.705708108104, 29943.876278918917, 32938.263906810811, 36232.090297491894].forEach((v, i) =>
    close(result.annualLimits![i], v),
  );
  close(
    result.kharif.rows.reduce((sum, row) => sum + row.borrowerAcres!, 0),
    0.12,
  );
  close(
    result.rabi.rows.reduce((sum, row) => sum + row.borrowerAcres!, 0),
    0.12,
  );
  close(result.kharif.rows[0].recordedAcres!, 4.1275);
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
    input.kharif.rows[0].area = area('acre', [value, '', '']);
    const result = calculateKcc(input);
    assert.ok(result.errors.length > 0, value);
    assert.equal(result.annualLimits, null);
  }
});

test('uses district-specific finance rates and rejects unknown crop or district', () => {
  const input = kccWorkbookExample();
  input.cultivatedAcres = '1';
  input.kharif.rows = [{ id: 'horse', cropId: 'sof-22', area: area('acre', ['1', '', '']) }];
  input.rabi.enabled = false;
  input.district = 'Bilaspur';
  close(calculateKcc(input).annualLimits![0], 10539.1);
  input.district = 'Sirmour';
  close(calculateKcc(input).annualLimits![0], 10553.4);
  input.district = 'Invalid district';
  assert.equal(calculateKcc(input).annualLimits, null);
  input.district = 'Sirmour';
  input.kharif.rows[0].cropId = 'unknown';
  assert.equal(calculateKcc(input).annualLimits, null);
});

test('disabled seasons exclude drafts and restoring them exposes errors again', () => {
  const input = kccWorkbookExample();
  input.rabi.rows[0].cropId = '';
  assert.equal(calculateKcc(input).annualLimits, null);
  input.rabi.enabled = false;
  close(calculateKcc(input).annualLimits![0], 17113.925189189188);
  input.rabi.enabled = true;
  assert.equal(calculateKcc(input).annualLimits, null);
  input.rabi.enabled = false;
  input.kharif.enabled = false;
  assert.equal(calculateKcc(input).annualLimits, null);
});

test('empty or zero-area active seasons cannot silently show a zero limit', () => {
  const input = kccWorkbookExample();
  input.kharif.rows = [];
  assert.equal(calculateKcc(input).annualLimits, null);
  input.kharif.rows = [{ id: 'zero', cropId: 'sof-13', area: area('acre', ['0', '', '']) }];
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
