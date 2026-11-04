import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topSectionBottom } from '../lib/kcc-pdf-layout.ts';

test('short crop tables make a shorter top section without crowding borrower details', () => {
  const bottom = topSectionBottom(78, true);
  assert.ok(bottom >= 91);
  assert.ok(bottom < 96);
});

test('the crop panel extends beyond its table rather than clipping longer rows', () => {
  assert.ok(topSectionBottom(109, false) >= 112);
  assert.ok(topSectionBottom(116, true) >= 119);
});
