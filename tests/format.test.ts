import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atsDigits, branchCode, dateLabel, lakhs, pendingAge, pendingDays, requestUrl } from '../lib/types.ts';

test('shows the loan added date in India time', () => {
  assert.equal(dateLabel('2026-10-11T18:40:00Z'), '12 Oct 2026');
});

test('counts pending calendar days in India time', () => {
  const now = new Date('2026-10-12T18:10:00Z');
  assert.equal(pendingDays('2026-10-11T18:20:00Z', now), 1);
  assert.equal(pendingDays('2026-10-11T18:40:00Z', now), 0);
  assert.equal(pendingDays('2026-10-09T18:20:00Z', now), 3);
});

test('shows amounts in lakhs', () => {
  assert.equal(lakhs(10000000), '₹1 L');
  assert.equal(lakhs(49900000), '₹4.99 L');
  assert.equal(lakhs(25000000), '₹2.5 L');
  assert.equal(lakhs(1234567890), '₹123.46 L');
});

test('takes the branch code from the branch name', () => {
  assert.equal(branchCode('8117 · Rajban'), '8117');
  assert.equal(branchCode('50569 - Timbi'), '50569');
  assert.equal(branchCode('Paonta Main'), 'Paonta');
});

test('keeps only the digits of an ATS number', () => {
  assert.equal(atsDigits('ATS 28815414'), '28815414');
  assert.equal(atsDigits('28814585'), '28814585');
});

test('public loan and branch reads bypass the gateway only on the production app', () => {
  const app = 'https://amcc-agri-loan-tracker.vercel.app';
  const data = 'https://xebnciawqwscifzgrkbu.supabase.co/functions/v1/amcc-api';
  assert.equal(requestUrl('/api/branches', 'GET', app), `${data}/api/branches`);
  assert.equal(requestUrl('/api/loans?branchId=branch-01', 'GET', app), `${data}/api/loans?branchId=branch-01`);
  assert.equal(requestUrl('/api/loans/loan-id', 'GET', app), '/api/loans/loan-id');
  assert.equal(requestUrl('/api/loans', 'POST', app), '/api/loans');
  assert.equal(requestUrl('/api/admin/session', 'GET', app), '/api/admin/session');
  assert.equal(requestUrl('/api/loans', 'GET', 'http://localhost:3000'), '/api/loans');
});


test('ages pending badges by days waited', () => {
  assert.equal(pendingAge(0), 'fresh');
  assert.equal(pendingAge(6), 'fresh');
  assert.equal(pendingAge(7), 'aging');
  assert.equal(pendingAge(13), 'aging');
  assert.equal(pendingAge(14), 'overdue');
});
