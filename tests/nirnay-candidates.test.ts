import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findNirnayCandidates, readNirnayMatch } from '../supabase/functions/amcc-api/nirnay-candidates.ts';
const doc = (id: string, status: string) => ({
  document: {
    name: 'projects/p/databases/(default)/documents/loans/' + id,
    fields: {
      customerName: { stringValue: 'EXAMPLE BORROWER' },
      branch: { stringValue: '50569 : TIMBI' },
      amount: { doubleValue: 3 },
      category: { stringValue: 'Agriculture' },
      status: { stringValue: status },
    },
  },
});
test('duplicate lookup includes returned and sanctioned identities without importing them', async () => {
  const fetcher: any = async () =>
    Response.json([doc('returned-1', 'returned'), doc('sanctioned-1', 'sanctioned'), doc('already-linked', 'pending')]);
  const rows = await findNirnayCandidates(
    { borrowerName: 'Example Borrower', branchName: '50569 · TIMBI', linkedIds: ['already-linked'] },
    fetcher,
  );
  assert.deepEqual(
    rows.map((r: any) => r.status),
    ['returned', 'sanctioned'],
  );
  assert.equal(rows[0].id, 'nirnay:returned-1');
  assert.equal(rows[0].amountPaise, 30000000);
});
test('duplicate lookup fails closed when existing Nirnay records cannot be checked', async () => {
  await assert.rejects(
    () =>
      findNirnayCandidates(
        { borrowerName: 'Example Borrower', branchName: '50569 · TIMBI', linkedIds: [] },
        async () => new Response('', { status: 503 }),
      ),
    /check existing/i,
  );
});
test('attachment retains nested reminders and existing workflow fields', async () => {
  const document = doc('returned-1', 'returned').document as any;
  document.fields.documentationDate = { stringValue: '2026-10-20' };
  document.fields.reminderMails = {
    arrayValue: {
      values: [{ mapValue: { fields: { date: { stringValue: '2026-10-19' }, sent: { booleanValue: true } } } }],
    },
  };
  document.fields.monthEndCleared = { booleanValue: true };
  const match = await readNirnayMatch(
    'returned-1',
    { borrowerName: 'Example Borrower', branchName: '50569 · TIMBI', amountPaise: 30000000 },
    async () => Response.json(document),
  );
  assert.equal(match.data.documentationDate, '2026-10-20');
  assert.deepEqual(match.data.reminderMails, [{ date: '2026-10-19', sent: true }]);
  assert.equal(match.data.monthEndCleared, true);
});
