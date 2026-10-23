import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyRequest } from '../lib/proxy.ts';

test('routes requests to the existing shared data service and carries admin cookie', async () => {
  const received: Record<string, any> = {};
  const fetcher = async (url: string, init: RequestInit) => {
    received.url = url; received.init = init;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'amcc_admin=abc; Path=/; HttpOnly; Secure; SameSite=Strict' } });
  };
  const request = new Request('https://app.vercel.app/api/admin/session', { method: 'POST', headers: { cookie: 'amcc_admin=old', origin: 'https://app.vercel.app', 'content-type': 'application/json' }, body: '{"password":"test"}' });
  const response = await proxyRequest(request, fetcher as typeof fetch);
  assert.equal(received.url, 'https://xebnciawqwscifzgrkbu.supabase.co/functions/v1/amcc-api/api/admin/session');
  assert.equal((received.init.headers as Headers).get('origin'), 'https://xebnciawqwscifzgrkbu.supabase.co');
  assert.ok((received.init.headers as Headers).get('apikey'));
  assert.equal((received.init.headers as Headers).get('cookie'), 'amcc_admin=old');
  assert.equal(received.init.body, '{"password":"test"}');
  assert.equal(response.headers.get('set-cookie')?.includes('amcc_admin=abc'), true);
});

test('does not cache loan reads and refuses paths outside the API', async () => {
  const fetcher = async (_url: string, init: RequestInit) => {
    assert.equal(init.cache, 'no-store');
    return Response.json([]);
  };
  const response = await proxyRequest(new Request('https://app.vercel.app/api/loans?branchId=branch-02'), fetcher as typeof fetch);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.status, 200);
  const invalid = await proxyRequest(new Request('https://app.vercel.app/other'), fetcher as typeof fetch);
  assert.equal(invalid.status, 404);
});

test('preserves the service session lifetime and sign-out cookie', async () => {
  const loginCookie = 'amcc_admin=abc; Path=/; HttpOnly; Max-Age=2592000';
  const login = await proxyRequest(new Request('https://app.vercel.app/api/admin/session', { method: 'POST', headers: { origin: 'https://app.vercel.app' }, body: '{}' }), (async () => new Response('{}', { headers: { 'set-cookie': loginCookie } })) as unknown as typeof fetch);
  assert.equal(login.headers.get('set-cookie'), loginCookie);
  const logout = await proxyRequest(new Request('https://app.vercel.app/api/admin/session', { method: 'DELETE', headers: { origin: 'https://app.vercel.app' } }), (async () => new Response('{}', { headers: { 'set-cookie': 'amcc_admin=; Path=/; Max-Age=0' } })) as unknown as typeof fetch);
  assert.equal(logout.headers.get('set-cookie'), 'amcc_admin=; Path=/; Max-Age=0');
  const renewed = await proxyRequest(new Request('https://app.vercel.app/api/admin/session', { headers: { cookie: 'amcc_admin=abc' } }), (async () => new Response('{"admin":true}', { headers: { 'content-type': 'application/json', 'set-cookie': 'amcc_admin=renewed; Path=/; Max-Age=2592000' } })) as unknown as typeof fetch);
  assert.equal(renewed.headers.get('set-cookie'), 'amcc_admin=renewed; Path=/; Max-Age=2592000');
});

test('forwards loan deletes to the shared data service', async () => {
  const received: Record<string, any> = {};
  const fetcher = async (url: string, init: RequestInit) => { received.url = url; received.init = init; return Response.json({ ok: true }); };
  const response = await proxyRequest(new Request('https://app.vercel.app/api/loans/abc123', { method: 'DELETE', headers: { origin: 'https://app.vercel.app', 'content-type': 'application/json' }, body: '{"version":3}' }), fetcher as typeof fetch);
  assert.equal(response.status, 200);
  assert.equal(received.url, 'https://xebnciawqwscifzgrkbu.supabase.co/functions/v1/amcc-api/api/loans/abc123');
  assert.equal(received.init.method, 'DELETE');
  assert.equal(received.init.body, '{"version":3}');
  const foreign = await proxyRequest(new Request('https://app.vercel.app/api/loans/abc123', { method: 'DELETE', headers: { origin: 'https://evil.example' } }), fetcher as typeof fetch);
  assert.equal(foreign.status, 403);
});

test('turns a non-JSON error from the data service into a readable message', async () => {
  const fetcher = async () => new Response('Method Not Allowed', { status: 405, headers: { 'content-type': 'text/plain' } });
  const response = await proxyRequest(new Request('https://app.vercel.app/api/loans/abc', { method: 'DELETE', headers: { origin: 'https://app.vercel.app' } }), fetcher as unknown as typeof fetch);
  assert.equal(response.status, 405);
  assert.match((await response.json()).error, /support deleting/);
  const other = await proxyRequest(new Request('https://app.vercel.app/api/loans'), (async () => new Response('<html>oops</html>', { status: 500 })) as unknown as typeof fetch);
  assert.match((await other.json()).error, /\(500\)/);
});

