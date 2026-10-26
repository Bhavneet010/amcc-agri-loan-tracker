import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/amcc-api/handler.ts';
import { signSession } from '../supabase/functions/amcc-api/auth.ts';
import { AppError } from '../supabase/functions/amcc-api/validation.ts';

const origin = 'https://amcc-agri-loan-tracker.vercel.app';
const base = 'https://example.supabase.co/functions/v1/amcc-api';
const secret = 'a-test-session-secret';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function fixture() {
  let row: any = null;
  let charge: any = null;
  const objects = new Set<string>();
  const db: any = {
    getConfig: async () => ({ enabled: true, passwordSalt: 's', passwordHash: 'h', sessionSecret: secret }),
    listBranches: async () => [{ id: 'branch-01', name: 'Test branch', version: 1 }],
    listLoans: async () => (row ? [{ ...row, charge: charge && { ...charge } }] : []),
    getLoan: async () => {
      if (!row) throw new AppError('Loan not found.', 404);
      return { ...row, charge: charge && { ...charge } };
    },
    createLoan: async (input: any) => {
      row = {
        id: 'loan-1',
        branchName: 'Test branch',
        status: 'pending',
        remarks: '',
        compliance: 'none',
        version: 1,
        ...input,
      };
      return { ...row };
    },
    updateLoan: async (_id: string, version: number, changes: any) => {
      const { requestId, ...rest } = changes;
      row = { ...row, ...rest, version: version + 1 };
      return { ...row };
    },
    deleteLoan: async () => {
      row = null;
      charge = null;
    },
    setCharge: async (_id: string, choice: string, image?: { path: string } | null) => {
      charge = {
        choice,
        imagePath: image === undefined ? (charge?.imagePath ?? null) : (image?.path ?? null),
        uploadedAt: image ? '2026-10-26T00:00:00.000Z' : (charge?.uploadedAt ?? null),
      };
    },
    clearChargeImage: async (_id: string, path: string) => {
      if (charge?.imagePath === path) charge = { ...charge, imagePath: null };
    },
    uploadChargeImage: async (path: string) => void objects.add(path),
    removeChargeObject: async (path: string) => void objects.delete(path),
    signChargeImage: async (path: string) => `https://signed.example/${path}`,
  };
  const handler = createHandler(db, 'key');
  const call = (path: string, method = 'GET', body?: unknown, cookie = '', type = 'application/json') =>
    handler(
      new Request(base + path, {
        method,
        headers: { apikey: 'key', origin, 'content-type': type, ...(cookie ? { cookie } : {}) },
        ...(body === undefined ? {} : { body: body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body) }),
      }),
    );
  return {
    call,
    objects,
    get charge() {
      return charge;
    },
  };
}
const renewal = {
  branchId: 'branch-01',
  category: 'renewal',
  atsId: 'ATS 12345678',
  borrowerName: 'B',
  amount: '300000',
};
const admin = async () => `amcc_admin=${await signSession(secret)}`;

test('renewals above ₹2 lakh cannot be saved without a Yes or No answer', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/loans', 'POST', renewal)).status, 400);
  assert.equal((await f.call('/api/loans', 'POST', { ...renewal, chargeChoice: 'maybe' })).status, 400);
  assert.equal((await f.call('/api/loans', 'POST', { ...renewal, amount: '200000' })).status, 201);
});

test('a declined answer is recorded and returned with the loan', async () => {
  const f = fixture();
  const response = await f.call('/api/loans', 'POST', { ...renewal, chargeChoice: 'no' });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).chargeDetails, { choice: 'no', hasImage: false, uploadedAt: null });
});

test('uploaded image is admin-only to view and deleted once sanctioned', async () => {
  const f = fixture();
  await f.call('/api/loans', 'POST', { ...renewal, chargeChoice: 'yes' });
  assert.equal(
    (await f.call('/api/loans/loan-1/charge', 'POST', new Uint8Array([1, 2, 3]), '', 'image/jpeg')).status,
    400,
  );
  const uploaded = await f.call('/api/loans/loan-1/charge', 'POST', jpeg, '', 'image/jpeg');
  assert.equal(uploaded.status, 200);
  const loan = await uploaded.json();
  assert.equal(loan.chargeDetails.hasImage, true);
  assert.equal(loan.charge, undefined, 'storage path stays server-side');
  assert.equal(f.objects.size, 1);

  assert.equal((await f.call('/api/loans/loan-1/charge')).status, 401);
  const cookie = await admin();
  const view = await f.call('/api/loans/loan-1/charge', 'GET', undefined, cookie);
  assert.match((await view.json()).url, /^https:\/\/signed\.example\/loan-1\//);

  const sanctioned = await f.call(
    '/api/loans/loan-1',
    'PATCH',
    { version: 1, status: 'sanctioned', remarks: '' },
    cookie,
  );
  assert.equal(sanctioned.status, 200);
  assert.equal((await sanctioned.json()).chargeDetails.hasImage, false);
  assert.equal(f.objects.size, 0);
  assert.equal(f.charge.imagePath, null);
  assert.equal(f.charge.choice, 'yes');
});

test('replacing or declining removes the earlier image', async () => {
  const f = fixture();
  await f.call('/api/loans', 'POST', { ...renewal, chargeChoice: 'yes' });
  await f.call('/api/loans/loan-1/charge', 'POST', jpeg, '', 'image/jpeg');
  await f.call('/api/loans/loan-1/charge', 'POST', jpeg, '', 'image/jpeg');
  assert.equal(f.objects.size, 1);
  const edit = { version: 1, atsId: renewal.atsId, borrowerName: 'B', amount: '300000', chargeChoice: 'no' };
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', edit)).status, 200);
  assert.equal(f.objects.size, 0);
  assert.equal(f.charge.choice, 'no');
});

test('older renewals raised above ₹2 lakh must answer when edited', async () => {
  const f = fixture();
  await f.call('/api/loans', 'POST', { ...renewal, amount: '100000' });
  const raise = { version: 1, atsId: renewal.atsId, borrowerName: 'B', amount: '250000' };
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', raise)).status, 400);
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', { ...raise, chargeChoice: 'yes' })).status, 200);
  assert.equal((await f.call('/api/loans/loan-1/charge', 'POST', jpeg, '', 'image/jpeg')).status, 200);
});

test('deleting a loan removes its charge image', async () => {
  const f = fixture();
  await f.call('/api/loans', 'POST', { ...renewal, chargeChoice: 'yes' });
  await f.call('/api/loans/loan-1/charge', 'POST', jpeg, '', 'image/jpeg');
  assert.equal((await f.call('/api/loans/loan-1', 'DELETE', { version: 1 })).status, 200);
  assert.equal(f.objects.size, 0);
});
