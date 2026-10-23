import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBorrower, validateSharedCreate, validateNirnayPatch, handleLinkage } from '../supabase/functions/amcc-api/linkage.ts';

test('shared create accepts a missing ATS only from Nirnay and requires a stable request ID', () => {
  const row = validateSharedCreate({ branchId: 'branch-01', borrowerName: ' Borrower ', amountPaise: 25000000, requestId: 'request-12345678' }, 'nirnay');
  assert.equal(row.atsId, null); assert.equal(row.borrowerName, 'Borrower');
  assert.throws(() => validateSharedCreate({ ...row, requestId: '' }, 'nirnay'));
  assert.throws(() => validateSharedCreate(row, 'agri'));
  assert.throws(() => validateSharedCreate({ ...row, amountPaise: 1.5 }, 'nirnay'));
  assert.throws(() => validateSharedCreate({ ...row, category: 'renewal' }, 'nirnay'));
});
test('candidate matching ignores case and spacing without merging distinct amounts silently', () => {
  assert.equal(normalizeBorrower('  Sandeep  Kumar '), normalizeBorrower('SANDEEP KUMAR'));
  assert.notEqual(normalizeBorrower('Sandeep Kumar'), normalizeBorrower('Sandeep Singh'));
});
test('Nirnay workflow status is kept local and privileged fields cannot be supplied', () => {
  const patch = validateNirnayPatch({ version: 2, data: { status: 'returned', remarks: 'Documents required', receiveDate: '2026-10-23', documentationDate: '', disbursementDate: '' }, requestId: 'request-12345678', author: 'Officer' });
  assert.equal(patch.data.status, 'returned');
  assert.throws(() => validateNirnayPatch({ ...patch, data: { sharedStatus: 'sanctioned' } }));
  assert.throws(() => validateNirnayPatch({ ...patch, data: { category: 'SME' } }));
});
test('Nirnay remarks require a signed session, while local status edits do not', async () => {
  const calls: any[] = [];
  const db: any = { getSharedLoan: async () => ({ id: 'shared-1', version: 2, remarks: '' }), updateNirnay: async (...args: any[]) => { calls.push(args); return {}; } };
  const request = new Request('https://project.supabase.co/api/linkage/loans/shared-1', { method: 'PATCH' });
  const input = { version: 2, data: { remarks: 'New remark' }, requestId: 'request-12345678', author: 'Officer' };
  await assert.rejects(() => handleLinkage(request, '/api/linkage/loans/shared-1', db, input, false), /Admin login/);
  await handleLinkage(request, '/api/linkage/loans/shared-1', db, { ...input, data: { status: 'sanctioned' } }, false);
  assert.equal(calls.length, 1);
});
