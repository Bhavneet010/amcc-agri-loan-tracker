import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atsDigits, branchCode, lakhs } from '../lib/types.ts';

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
