import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBorrower,
  validateSharedCreate,
  validateNirnayPatch,
  handleLinkage,
} from '../supabase/functions/amcc-api/linkage.ts';
import { validateDecision } from '../supabase/functions/amcc-api/validation.ts';

test('shared create accepts a missing ATS only from Nirnay and requires a stable request ID', () => {
  const row = validateSharedCreate(
    { branchId: 'branch-01', borrowerName: ' Borrower ', amountPaise: 25000000, requestId: 'request-12345678' },
    'nirnay',
  );
  assert.equal(row.atsId, null);
  assert.equal(row.borrowerName, 'Borrower');
  assert.throws(() => validateSharedCreate({ ...row, requestId: '' }, 'nirnay'));
  assert.throws(() => validateSharedCreate(row, 'agri'));
  assert.throws(() => validateSharedCreate({ ...row, amountPaise: 1.5 }, 'nirnay'));
  assert.throws(() => validateSharedCreate({ ...row, category: 'renewal' }, 'nirnay'));
});
test('candidate matching ignores case and spacing without merging distinct amounts silently', () => {
  assert.equal(normalizeBorrower('  Sandeep  Kumar '), normalizeBorrower('SANDEEP KUMAR'));
  assert.notEqual(normalizeBorrower('Sandeep Kumar'), normalizeBorrower('Sandeep Singh'));
});
test('Nirnay workflow fields and shared decision values are validated', () => {
  const patch = validateNirnayPatch({
    version: 2,
    data: {
      status: 'returned',
      remarks: 'Documents required',
      receiveDate: '2026-10-23',
      documentationDate: '',
      disbursementDate: '',
    },
    requestId: 'request-12345678',
    author: 'Officer',
  });
  assert.equal(patch.data.status, 'returned');
  assert.throws(() => validateNirnayPatch({ ...patch, data: { sharedStatus: 'sanctioned' } }));
  assert.throws(() => validateNirnayPatch({ ...patch, data: { category: 'SME' } }));
});
test('Nirnay remarks save without a session while shared decisions still require one', async () => {
  const calls: any[] = [];
  const db: any = {
    getSharedLoan: async () => ({ id: 'shared-1', version: 2, status: 'pending', remarks: '' }),
    updateNirnay: async (...args: any[]) => {
      calls.push(args);
      return {};
    },
  };
  const request = new Request('https://project.supabase.co/api/linkage/loans/shared-1', { method: 'PATCH' });
  const input = { version: 2, data: { remarks: 'New remark' }, requestId: 'request-12345678', author: 'Officer' };
  await handleLinkage(request, '/api/linkage/loans/shared-1', db, input, false);
  await assert.rejects(
    () =>
      handleLinkage(request, '/api/linkage/loans/shared-1', db, { ...input, data: { status: 'sanctioned' } }, false),
    /Admin login/,
  );
  await handleLinkage(
    request,
    '/api/linkage/loans/shared-1',
    db,
    { ...input, data: { status: 'pending', allocatedTo: 'Officer' } },
    false,
  );
  assert.equal(calls.length, 2);
});
test('new Nirnay remarks do not require a password', async () => {
  const db: any = { createSharedLoan: async (input: any) => ({ ...input, id: 'new-shared' }) };
  const saved = await handleLinkage(
    new Request('https://project.supabase.co/api/linkage/loans', { method: 'POST' }),
    '/api/linkage/loans',
    db,
    {
      branchId: 'branch-01',
      borrowerName: 'Example borrower',
      amountPaise: 25000000,
      requestId: 'request-no-password',
      remarks: 'Documents submitted',
    },
    false,
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.data.remarks, 'Documents submitted');
});

test('sanctioned loan deletion and restoration require admin authentication, remarks do not', async () => {
  const calls: any[] = [];
  const db: any = {
    getSharedLoan: async () => ({ id: 'shared-1', version: 2, status: 'sanctioned' }),
    updateNirnay: async (...args: any[]) => {
      calls.push(args);
      return {};
    },
  };
  const request = new Request('https://project.supabase.co/api/linkage/loans/shared-1', { method: 'PATCH' });
  const input = { version: 2, data: {}, requestId: 'request-12345678' };
  for (const archived of [true, false]) {
    await assert.rejects(
      () => handleLinkage(request, '/api/linkage/loans/shared-1', db, { ...input, archived }, false),
      /Admin login/,
    );
    await handleLinkage(request, '/api/linkage/loans/shared-1', db, { ...input, archived }, true);
  }
  await handleLinkage(
    request,
    '/api/linkage/loans/shared-1',
    db,
    { ...input, data: { remarks: 'Documents received' } },
    false,
  );
  assert.equal(calls.length, 3);
});
test('returning requires a reason and a real date, renewals cannot be returned', () => {
  const current = { status: 'pending', category: 'new' };
  assert.throws(() => validateDecision(current, { status: 'returned' }), /reason/i);
  assert.throws(
    () => validateDecision(current, { status: 'returned', returnReason: 'Incomplete', returnedDate: '2026-02-30' }),
    /date/i,
  );
  assert.throws(
    () =>
      validateDecision(
        { ...current, category: 'renewal' },
        { status: 'returned', returnReason: 'Incomplete', returnedDate: '2026-10-23' },
      ),
    /fresh/i,
  );
  assert.doesNotThrow(() =>
    validateDecision(current, { status: 'returned', returnReason: 'Incomplete', returnedDate: '2026-10-22' }),
  );
});
