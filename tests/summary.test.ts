import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLoans } from '../lib/loan-summary.ts';
import type { Loan } from '../lib/types.ts';

const now = new Date('2026-10-12T18:00:00Z');
const loan = (status: Loan['status'], createdAt: string, updatedAt = createdAt) => ({ status, createdAt, updatedAt } as Loan);

test('today uses India dates and counts sanctions on their update date', () => {
  const loans = [
    loan('pending', '2026-10-11T18:40:00Z'),
    loan('sanctioned', '2026-10-11T18:20:00Z'),
    loan('sanctioned', '2026-09-01T10:00:00Z', '2026-10-12T10:00:00Z'),
  ];
  assert.deepEqual(summarizeLoans(loans, 'today', now), { pending: 1, sanctioned: 1 });
});
test('today carries forward loans still pending from earlier days', () => {
  const loans = [
    loan('pending', '2026-10-11T18:20:00Z'),
    loan('pending', '2026-09-01T10:00:00Z'),
    loan('sanctioned', '2026-10-11T10:00:00Z'),
  ];
  assert.deepEqual(summarizeLoans(loans, 'today', now), { pending: 2, sanctioned: 0 });
});
test('month excludes previous months and years, all time includes them', () => {
  const loans = [loan('pending', '2026-09-30T18:40:00Z'), loan('pending', '2025-10-12T00:00:00Z'), loan('sanctioned', '2026-09-30T10:00:00Z')];
  assert.deepEqual(summarizeLoans(loans, 'month', now), { pending: 1, sanctioned: 0 });
  assert.deepEqual(summarizeLoans(loans, 'all', now), { pending: 2, sanctioned: 1 });
});
test('empty summaries show zero counts', () => {
  assert.deepEqual(summarizeLoans([], 'today', now), { pending: 0, sanctioned: 0 });
});
