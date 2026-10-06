import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLoanInput, publicChanges } from '../lib/loan-validation.ts';

test('normalizes ATS and preserves exact paise', () => {
  assert.deepEqual(validateLoanInput({ atsId: ' ATS-001 ', amount: '123.45' }), { atsId: 'ATS-001', amountPaise: 12345 });
});
test('rejects blank ATS, invalid and unsafe amounts', () => {
  assert.throws(() => validateLoanInput({ atsId: ' ', amount: '12' }));
  for (const amount of ['0', '-1', '1.234', 'NaN', 'Infinity', '9007199254740991', '1e4']) {
    assert.throws(() => validateLoanInput({ atsId: 'A', amount }));
  }
});
test('rejects forged admin fields and editing sanctioned records', () => {
  const record = { status: 'pending', remarks: 'Submit land records' };
  assert.throws(() => publicChanges(record, { status: 'sanctioned' }));
  assert.throws(() => publicChanges(record, { remarks: 'Approved' }));
  assert.throws(() => publicChanges({ ...record, status: 'sanctioned' }, { atsId: 'B', amount: '12' }));
  assert.deepEqual(publicChanges(record, { compliance: 'complied' }), { compliance: 'complied' });
  assert.throws(() => publicChanges({ ...record, remarks: '' }, { compliance: 'complied' }));
});
