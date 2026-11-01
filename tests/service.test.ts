import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/amcc-api/handler.ts';
import { signSession } from '../supabase/functions/amcc-api/auth.ts';
import { AppError } from '../supabase/functions/amcc-api/validation.ts';

const origin = 'https://amcc-agri-loan-tracker.vercel.app';
const base = 'https://example.supabase.co/functions/v1/amcc-api';
function fixture(enabled = true) {
  let row: any = {
    id: 'loan-1',
    branchId: 'branch-01',
    branchName: 'Test branch',
    category: 'new',
    atsId: 'ATS 12345678',
    borrowerName: 'Test Borrower',
    amountPaise: 10000,
    status: 'pending',
    remarks: '',
    compliance: 'none',
    version: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  const writes: any[] = [];
  let attempts = 0;
  const config = { enabled, passwordSalt: 'salt', passwordHash: 'hash', sessionSecret: 'a-test-session-secret' };
  const db: any = {
    getConfig: async () => config,
    listBranches: async () => [{ id: 'branch-01', name: 'Test branch', version: 1 }],
    listLoans: async () => (row ? [{ ...row }] : []),
    getLoan: async () => {
      if (!row) throw new AppError('Loan not found.', 404);
      return { ...row };
    },
    createLoan: async (input: any) => {
      writes.push(input);
      row = { ...row, ...input };
      return { ...row };
    },
    updateLoan: async (id: string, version: number, changes: any, actor: string) => {
      if (version !== row.version)
        throw new AppError('This loan was updated by someone else. Refresh and try again.', 409);
      writes.push({ id, changes, actor });
      row = { ...row, ...changes, version: version + 1 };
      return { ...row };
    },
    deleteLoan: async (_id: string, version: number) => {
      if (version !== row.version) throw new AppError('This loan was updated by someone else.', 409);
      row = null;
      writes.push('delete');
    },
    renameBranch: async () => [],
    loginAttempt: async () => ++attempts,
    clearLoginAttempts: async () => {},
  };
  const handler = createHandler(db, 'public-test-key');
  const call = (path: string, method = 'GET', body?: unknown, cookie = '', headers: Record<string, string> = {}) =>
    handler(
      new Request(base + path, {
        method,
        headers: {
          apikey: 'public-test-key',
          origin,
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return {
    call,
    writes,
    config,
    get row() {
      return row;
    },
    set row(value) {
      row = value;
    },
  };
}

test('migration gate refuses access until import is enabled', async () => {
  const f = fixture(false);
  assert.equal((await f.call('/api/loans')).status, 503);
});
test('API checks its public key, CORS, route and method', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/loans', 'GET', undefined, '', { apikey: 'wrong' })).status, 401);
  assert.equal((await f.call('/api/loans', 'POST', {}, '', { origin: 'https://evil.example' })).status, 403);
  assert.equal(
    (await f.call('/api/loans', 'POST', {}, '', { origin: 'https://xebnciawqwscifzgrkbu.supabase.co' })).status,
    400,
  );
  assert.equal((await f.call('/other')).status, 404);
  assert.equal((await f.call('/api/loans', 'PUT', {})).status, 405);
  const preflight = await f.call('/api/loans', 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
});
test('loan creation keeps exact integer paise and borrower name, rejects unknown fields', async () => {
  const f = fixture();
  const input = {
    branchId: 'branch-01',
    category: 'new',
    atsId: ' ATS 87654321 ',
    borrowerName: ' Borrower ',
    amount: '100.25',
  };
  const response = await f.call('/api/loans', 'POST', input);
  assert.equal(response.status, 201);
  assert.equal(f.writes[0].amountPaise, 10025);
  assert.equal(f.writes[0].borrowerName, 'Borrower');
  assert.equal((await f.call('/api/loans', 'POST', { ...input, status: 'sanctioned' })).status, 400);
  assert.equal((await f.call('/api/loans', 'POST', { ...input, amount: '1.001' })).status, 400);
});
test('sanctioned reads mask old remarks without modifying stored data', async () => {
  const f = fixture();
  f.row = { ...f.row, status: 'sanctioned', remarks: 'Old private workflow note', compliance: 'awaiting' };
  const data = await (await f.call('/api/loans')).json();
  assert.equal(data[0].remarks, '');
  assert.equal(data[0].compliance, 'none');
  assert.equal(f.row.remarks, 'Old private workflow note');
});
test('branch edits cannot change admin fields or sanctioned loans', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', { version: 1, status: 'sanctioned' })).status, 401);
  assert.equal((await f.call('/api/branches', 'PATCH', { id: 'branch-01', name: 'Renamed', version: 1 })).status, 401);
  f.row = { ...f.row, status: 'sanctioned' };
  assert.equal(
    (await f.call('/api/loans/loan-1', 'PATCH', { version: 1, atsId: 'ATS 12345678', amount: '200' })).status,
    403,
  );
  assert.equal((await f.call('/api/loans/loan-1', 'DELETE', { version: 1 })).status, 401);
  f.row = { ...f.row, remarks: 'Historical note', compliance: 'awaiting' };
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', { version: 1, compliance: 'complied' })).status, 403);
  assert.equal(f.writes.length, 0);
});
test('omitting a borrower name keeps an existing name and a stale edit cannot win', async () => {
  const f = fixture();
  assert.equal(
    (await f.call('/api/loans/loan-1', 'PATCH', { version: 1, atsId: 'ATS 12345678', amount: '200' })).status,
    200,
  );
  assert.equal(f.row.borrowerName, 'Test Borrower');
  assert.equal(
    (await f.call('/api/loans/loan-1', 'PATCH', { version: 1, atsId: 'ATS 12345678', amount: '300' })).status,
    409,
  );
  assert.equal(f.writes.length, 1);
});
test('admin sanction clears remarks and compliance; branch compliance needs current remarks', async () => {
  const f = fixture();
  const cookie = `amcc_admin=${await signSession(f.config.sessionSecret)}`;
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', { version: 1, compliance: 'complied' })).status, 400);
  assert.equal(
    (await f.call('/api/loans/loan-1', 'PATCH', { version: 1, remarks: 'Documents needed' }, cookie)).status,
    200,
  );
  assert.equal(f.row.compliance, 'awaiting');
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', { version: 2, compliance: 'complied' })).status, 200);
  assert.equal((await f.call('/api/loans/loan-1', 'PATCH', { version: 3, status: 'sanctioned' }, cookie)).status, 200);
  assert.equal(f.row.remarks, '');
  assert.equal(f.row.compliance, 'none');
});
test('sessions renew for 30 days; invalid signatures and expired tokens are denied', async () => {
  const f = fixture();
  assert.deepEqual(await (await f.call('/api/admin/session')).json(), { admin: false });
  const token = await signSession(f.config.sessionSecret);
  const result = await f.call('/api/admin/session', 'GET', undefined, `amcc_admin=${token}`);
  assert.deepEqual(await result.json(), { admin: true });
  assert.match(result.headers.get('set-cookie')!, /Max-Age=2592000/);
  assert.deepEqual(await (await f.call('/api/admin/session', 'GET', undefined, `amcc_admin=${token}bad`)).json(), {
    admin: false,
  });
  const expired = await signSession(f.config.sessionSecret, Date.now() - 10);
  assert.deepEqual(await (await f.call('/api/admin/session', 'GET', undefined, `amcc_admin=${expired}`)).json(), {
    admin: false,
  });
  const logout = await f.call('/api/admin/session', 'DELETE');
  assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/);
});
test('login rate limits repeated password guesses', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++)
    assert.equal((await f.call('/api/admin/session', 'POST', { password: 'wrong' })).status, 401);
  assert.equal((await f.call('/api/admin/session', 'POST', { password: 'wrong' })).status, 429);
});
test('deletion rejects extra fields and removes only the expected version', async () => {
  const f = fixture();
  assert.equal((await f.call('/api/loans/loan-1', 'DELETE', { version: 1, anything: true })).status, 400);
  assert.equal((await f.call('/api/loans/loan-1', 'DELETE', { version: 1 })).status, 200);
  assert.equal((await f.call('/api/loans/loan-1')).status, 404);
});

test('adding a New loan that matches a Returned loan asks to update and resubmit it', async () => {
  const calls: any[] = [];
  const matches = [
    { id: 'returned-1', atsId: 'ATS 12345678', borrowerName: 'Test Borrower', amountPaise: 10000, atsMatch: false },
  ];
  const f = fixture();
  const handler = createHandler(
    {
      getConfig: async () => f.config,
      listBranches: async () => [{ id: 'branch-01', name: 'Test branch', version: 1 }],
      getLoan: async (id: string) => ({ ...f.row, id, status: 'pending', resubmittedAt: '2026-11-01T00:00:00.000Z' }),
      createLoan: async (input: any) => {
        calls.push(['create', input]);
        return { ...f.row, ...input };
      },
      findReturnedMatches: async (...args: any[]) => {
        calls.push(['find', ...args]);
        return matches;
      },
      resubmitReturned: async (id: string, input: any) => {
        calls.push(['resubmit', id, input]);
        return { id };
      },
    } as any,
    'public-test-key',
  );
  const post = (body: unknown) =>
    handler(
      new Request(base + '/api/loans', {
        method: 'POST',
        headers: { apikey: 'public-test-key', origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  const input = {
    branchId: 'branch-01',
    category: 'new',
    atsId: 'ATS 87654321',
    borrowerName: ' Test Borrower ',
    amount: '150',
    requestId: 'request-resubmit-1',
  };

  const prompt = await post(input);
  assert.equal(prompt.status, 409);
  const body = await prompt.json();
  assert.equal(body.needsConfirmation, true);
  assert.deepEqual(body.returnedMatches, matches);
  assert.deepEqual(calls.at(-1), ['find', 'branch-01', 'ATS 87654321', 'Test Borrower']);
  assert.ok(!calls.some(([kind]) => kind === 'create'));

  const resubmitted = await post({ ...input, resubmitReturnedId: 'returned-1' });
  assert.equal(resubmitted.status, 200);
  assert.equal((await resubmitted.json()).status, 'pending');
  assert.deepEqual(calls.at(-1), [
    'resubmit',
    'returned-1',
    {
      branchId: 'branch-01',
      atsId: 'ATS 87654321',
      borrowerName: 'Test Borrower',
      amountPaise: 15000,
      requestId: 'request-resubmit-1',
    },
  ]);

  // Confirmed as a different loan, a name-only match lets the new loan be added.
  assert.equal((await post({ ...input, ignoreReturned: true })).status, 201);
  assert.equal(calls.at(-1)[0], 'create');

  // The same ATS is the same application, so it cannot be added again as a different loan.
  matches[0].atsMatch = true;
  assert.equal((await post({ ...input, ignoreReturned: true })).status, 409);

  assert.equal((await post({ ...input, ignoreReturned: 'yes' })).status, 400);
  assert.equal((await post({ ...input, resubmitReturnedId: 7 })).status, 400);
  assert.equal((await post({ ...input, requestId: undefined, resubmitReturnedId: 'returned-1' })).status, 400);
  // Renewals cannot be returned, so they are never checked.
  const before = calls.length;
  assert.equal((await post({ ...input, category: 'renewal' })).status, 201);
  assert.ok(!calls.slice(before).some(([kind]) => kind === 'find'));
});
