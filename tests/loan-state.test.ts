import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upsertLoan } from '../lib/loan-state.ts';
import type { Loan } from '../lib/types.ts';
const loan = { id: 'a', branchId: 'branch-01', version: 3, amountPaise: 300 } as Loan;
test('saved rows appear immediately, once, without replacing a newer version', () => {
  const rows = upsertLoan([], loan, 'branch-01'); assert.equal(rows.length, 1);
  assert.deepEqual(upsertLoan(rows, { ...loan, version: 2, amountPaise: 200 }, ''), rows);
  assert.equal(upsertLoan(rows, { ...loan, version: 4, amountPaise: 400 }, '')[0].amountPaise, 400);
});
test('saving from a different branch does not leak rows into the selected branch', () => {
  assert.deepEqual(upsertLoan([], loan, 'branch-02'), []);
  assert.equal(upsertLoan([], loan, '').length, 1);
});
