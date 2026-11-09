import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchOfficers, groupLoans, officerForBranch } from '../lib/officers.ts';
import type { Loan } from '../lib/types.ts';

const loan = (id: string, branchName: string, createdAt: string, amountPaise = 100000000): Loan => ({
  id,
  branchId: 'branch-01',
  branchName,
  category: 'new',
  atsId: id,
  amountPaise,
  status: 'pending',
  remarks: '',
  compliance: 'none',
  version: 1,
  createdAt,
  updatedAt: createdAt,
});

test('every agri branch has an officer', () => {
  const names = [
    '2413 · MAJRA',
    '6784 · DHAULA KUAN',
    '1755 · PAONTA SAHIB',
    '4590 · KALA AMB',
    '3399 · RAJBAN',
    '4589 · SME TARUWALA',
    '7459 · KAFOTA',
    '50569 · TIMBI',
    '63982 · SHILLAI',
    '1680 · ADB PAONTA SAHIB',
    '686 · NAHAN',
    '8117 · RAJPUR',
    '50536 · BHAGANI',
  ];
  assert.equal(Object.keys(branchOfficers).length, 13);
  for (const name of names) assert.notEqual(officerForBranch(name), 'Unassigned', name);
  assert.equal(officerForBranch('1755 · PAONTA SAHIB'), 'Vibhor');
  assert.equal(officerForBranch('9999 · NEW BRANCH'), 'Unassigned');
});

test('groups by officer with counts and totals, unassigned last', () => {
  const groups = groupLoans(
    [
      loan('a', '8117 · RAJPUR', '2026-11-09T05:00:00Z'),
      loan('b', '9999 · NEW', '2026-11-09T05:00:00Z'),
      loan('c', '686 · NAHAN', '2026-11-08T05:00:00Z', 50000000),
      loan('d', '1680 · ADB PAONTA SAHIB', '2026-11-07T05:00:00Z'),
    ],
    'officer',
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.loans.map((l) => l.id), g.amountPaise]),
    [
      ['Anil Kumar', ['c'], 50000000],
      ['Vibhor', ['a', 'd'], 200000000],
      ['Unassigned', ['b'], 100000000],
    ],
  );
});

test('groups by received day in India time, newest first', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const groups = groupLoans(
    [
      loan('a', '8117 · RAJPUR', '2026-11-08T19:00:00Z'), // 9 Nov 00:30 IST
      loan('b', '8117 · RAJPUR', '2026-11-08T10:00:00Z'),
      loan('c', '8117 · RAJPUR', '2026-11-02T10:00:00Z'),
    ],
    'date',
    now,
  );
  assert.deepEqual(
    groups.map((g) => g.key),
    ['2026-11-09', '2026-11-08', '2026-11-02'],
  );
  assert.deepEqual(groups.map((g) => g.label).slice(0, 2), ['Today', 'Yesterday']);
  assert.match(groups[2].label, /02 Nov/);
});
