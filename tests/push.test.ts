import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHandler } from '../supabase/functions/amcc-api/handler.ts';
import { signSession } from '../supabase/functions/amcc-api/auth.ts';
import { alertMessage, deliverPushAlerts, type PushJob } from '../supabase/functions/amcc-api/push.ts';
import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  generatePushKeys,
  vapidAuthorization,
} from '../supabase/functions/amcc-api/webpush.ts';
import { base64UrlToBytes, sameKey } from '../lib/push.ts';
import { proxyRequest } from '../lib/proxy.ts';

const origin = 'https://amcc-agri-loan-tracker.vercel.app';
const base = 'https://example.supabase.co/functions/v1/amcc-api';
const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
const secret = 'a-test-session-secret';

async function phone() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, subscription: { endpoint, p256dh: base64UrlEncode(p256dh), auth: base64UrlEncode(auth) } };
}
// The receiving browser's side of RFC 8291, to prove the payload decrypts.
async function decrypt(
  pair: CryptoKeyPair,
  subscription: { p256dh: string; auth: string },
  body: Uint8Array<ArrayBuffer>,
) {
  const salt = body.slice(0, 16);
  const idLength = body[20];
  const asPublic = body.slice(21, 21 + idLength);
  const peer = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, pair.privateKey, 256));
  const hkdf = async (
    s: Uint8Array<ArrayBuffer>,
    ikm: Uint8Array<ArrayBuffer>,
    info: Uint8Array<ArrayBuffer>,
    bytes: number,
  ) =>
    new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: s, info },
        await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
        bytes * 8,
      ),
    );
  const text = new TextEncoder();
  const keyInfo = new Uint8Array([
    ...text.encode('WebPush: info\0'),
    ...base64UrlDecode(subscription.p256dh),
    ...asPublic,
  ]);
  const ikm = await hkdf(base64UrlDecode(subscription.auth), shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, text.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, text.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idLength)),
  );
  assert.equal(plain[plain.length - 1], 2, 'last record delimiter');
  return new TextDecoder().decode(plain.slice(0, -1));
}

test('push payloads decrypt on the subscribed phone', async () => {
  const { pair, subscription } = await phone();
  const body = await encryptPayload(subscription, '{"title":"New loan"}');
  assert.equal(new DataView(body.buffer).getUint32(16), 4096);
  assert.equal(await decrypt(pair, subscription, body), '{"title":"New loan"}');
});

test('VAPID tokens are signed for the push service origin', async () => {
  const keys = await generatePushKeys();
  const header = await vapidAuthorization(endpoint, keys, origin, Date.UTC(2026, 9, 29));
  const [, token, publicKey] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
  assert.equal(publicKey, keys.publicKey);
  const [head, claims, signature] = token.split('.');
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(claims)));
  assert.deepEqual(payload, {
    aud: 'https://fcm.googleapis.com',
    exp: Date.UTC(2026, 9, 29) / 1000 + 43200,
    sub: origin,
  });
  const verifier = await crypto.subtle.importKey(
    'raw',
    base64UrlDecode(keys.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  assert.ok(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifier,
      base64UrlDecode(signature),
      new TextEncoder().encode(`${head}.${claims}`),
    ),
  );
});

function fixture() {
  let keys: any = null;
  const subscriptions = new Map<string, any>();
  const jobs: PushJob[] = [];
  const finished: string[] = [];
  const background: Promise<unknown>[] = [];
  const db: any = {
    getConfig: async () => ({ enabled: true, sessionSecret: secret }),
    listBranches: async () => [{ id: 'branch-01', name: '8117 · Rajban', version: 1 }],
    createLoan: async (input: any) => ({ id: 'loan-1', ...input, status: 'pending' }),
    getPushKeys: async () => keys,
    savePushKeys: async (value: any) => {
      keys ??= value;
    },
    savePushSubscription: async (value: any) => {
      subscriptions.set(value.endpoint, value);
    },
    removePushSubscription: async (value: string) => {
      subscriptions.delete(value);
    },
    listPushSubscriptions: async () => [...subscriptions.values()],
    claimPushJobs: async () => jobs.splice(0),
    finishPushJob: async (id: string) => {
      finished.push(id);
    },
  };
  const handler = createHandler(db, 'public-test-key', (work) => background.push(work));
  const call = (path: string, method = 'GET', body?: unknown, cookie = '') =>
    handler(
      new Request(base + path, {
        method,
        headers: {
          apikey: 'public-test-key',
          origin,
          'content-type': 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { db, call, subscriptions, jobs, finished, background, keys: () => keys };
}

test('only an admin can fetch the push key and register a phone', async () => {
  const f = fixture();
  const { subscription } = await phone();
  const body = { endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } };
  assert.equal((await f.call('/api/admin/push')).status, 401);
  assert.equal((await f.call('/api/admin/push', 'POST', body)).status, 401);
  assert.equal(f.subscriptions.size, 0);

  const cookie = `amcc_admin=${await signSession(secret)}`;
  const first = await (await f.call('/api/admin/push', 'GET', undefined, cookie)).json();
  const second = await (await f.call('/api/admin/push', 'GET', undefined, cookie)).json();
  assert.equal(first.publicKey, second.publicKey, 'the signing key is created once');
  assert.equal(base64UrlDecode(first.publicKey).length, 65);

  assert.deepEqual(await (await f.call('/api/admin/push', 'POST', body, cookie)).json(), { subscribed: true });
  assert.deepEqual(f.subscriptions.get(endpoint), subscription);
  // Removal works after the admin session has ended, so signing out can clear the phone.
  assert.deepEqual(await (await f.call('/api/admin/push', 'DELETE', { endpoint })).json(), { subscribed: false });
  assert.equal(f.subscriptions.size, 0);
});

test('phone registrations only accept browser push services and valid keys', async () => {
  const f = fixture();
  const { subscription } = await phone();
  const cookie = `amcc_admin=${await signSession(secret)}`;
  const keys = { p256dh: subscription.p256dh, auth: subscription.auth };
  for (const body of [
    { endpoint: 'https://evil.example/fcm/send/abc', keys },
    { endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys },
    { endpoint, keys: { ...keys, auth: 'short' } },
    { endpoint, keys: { ...keys, p256dh: keys.auth } },
    { endpoint, keys, extra: true },
  ])
    assert.equal((await f.call('/api/admin/push', 'POST', body, cookie)).status, 400, JSON.stringify(body));
  assert.equal(
    (await f.call('/api/admin/push', 'POST', { endpoint: 'https://web.push.apple.com/abc', keys }, cookie)).status,
    200,
  );
});

test('creating a loan sends queued alerts after the reply', async () => {
  const f = fixture();
  const response = await f.call('/api/loans', 'POST', {
    branchId: 'branch-01',
    category: 'renewal',
    atsId: 'ATS 12345678',
    borrowerName: 'Ram Singh',
    amount: '1.5',
  });
  assert.equal(response.status, 201);
  assert.equal(f.background.length, 1);
  await Promise.all(f.background);
  assert.equal((await f.call('/api/branches')).status, 200);
  assert.equal(f.background.length, 1, 'reads do not send alerts');
});

const job: PushJob = {
  id: 'job-1',
  loanId: 'loan-1',
  branchName: '8117 · Rajban',
  category: 'renewal',
  borrowerName: 'Ram Singh',
  amountPaise: 35000000,
  sourceApp: 'agri',
};

test('alert text names the branch, borrower, type and amount', () => {
  assert.deepEqual(alertMessage(job), {
    title: 'New loan · 8117 · Rajban',
    body: 'Ram Singh — Renewal — ₹3,50,000',
    tag: 'loan-loan-1',
    url: '/',
  });
  assert.equal(
    alertMessage({ ...job, category: 'new', sourceApp: 'nirnay', amountPaise: 12345 }).body,
    'Ram Singh — New — ₹123.45 · via Nirnay',
  );
});

test('delivery finishes sent alerts, drops gone phones and retries failures', async () => {
  const f = fixture();
  const a = await phone();
  const b = await phone();
  const gone = { ...b.subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/gone' };
  f.subscriptions.set(endpoint, a.subscription);
  f.subscriptions.set(gone.endpoint, gone);
  f.jobs.push(job);
  const sent: { url: string; init: RequestInit }[] = [];
  await deliverPushAlerts(f.db, (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status: url === endpoint ? 201 : 410 });
  }) as typeof fetch);
  assert.deepEqual(
    sent.map((s) => s.url),
    [endpoint, gone.endpoint],
  );
  const headers = sent[0].init.headers as Record<string, string>;
  assert.equal(headers['Content-Encoding'], 'aes128gcm');
  assert.match(headers.Authorization, /^vapid t=.+, k=/);
  assert.deepEqual(
    JSON.parse(await decrypt(a.pair, a.subscription, sent[0].init.body as Uint8Array<ArrayBuffer>)),
    alertMessage(job),
  );
  assert.deepEqual(f.finished, ['job-1']);
  assert.deepEqual([...f.subscriptions.keys()], [endpoint]);

  f.jobs.push({ ...job, id: 'job-2' });
  await deliverPushAlerts(f.db, (async () => new Response(null, { status: 503 })) as typeof fetch);
  assert.deepEqual(f.finished, ['job-1'], 'a failed alert stays queued for a retry');

  f.subscriptions.clear();
  f.jobs.push({ ...job, id: 'job-3' });
  await deliverPushAlerts(f.db, (async () => assert.fail('nothing to send to')) as typeof fetch);
  assert.deepEqual(f.finished, ['job-1', 'job-3'], 'alerts with no registered phone are dropped');
});

test('the gateway forwards phone alert registration', async () => {
  let forwarded = '';
  const response = await proxyRequest(
    new Request(`${origin}/api/admin/push`, { method: 'DELETE', headers: { origin }, body: '{}' }),
    (async (url: string) => {
      forwarded = url;
      return Response.json({ subscribed: false });
    }) as typeof fetch,
  );
  assert.equal(response.status, 200);
  assert.match(forwarded, /\/amcc-api\/api\/admin\/push$/);
});

test('the client compares the subscribed key with the server key', () => {
  const key = base64UrlEncode(new Uint8Array([4, 1, 2, 255]));
  assert.deepEqual([...base64UrlToBytes(key)], [4, 1, 2, 255]);
  assert.ok(sameKey(new Uint8Array([4, 1, 2, 255]).buffer, key));
  assert.ok(!sameKey(new Uint8Array([4, 1, 2]).buffer, key));
  assert.ok(!sameKey(null, key));
});

test('the service worker shows alerts and opens the app when tapped', async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const shown: any[] = [];
  const opened: string[] = [];
  let focused = false;
  let windows: any[] = [];
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { origin },
      addEventListener: (name: string, handler: (event: any) => void) => {
        listeners[name] = handler;
      },
      registration: { showNotification: async (title: string, options: any) => shown.push({ title, options }) },
      clients: {
        matchAll: async () => windows,
        openWindow: async (url: string) => opened.push(url),
      },
    },
    URL,
  });
  let work: Promise<unknown> | undefined;
  const waitUntil = (value: Promise<unknown>) => {
    work = value;
  };
  listeners.push({ data: { json: () => alertMessage(job) }, waitUntil });
  await work;
  assert.equal(shown[0].title, 'New loan · 8117 · Rajban');
  assert.equal(shown[0].options.body, 'Ram Singh — Renewal — ₹3,50,000');
  assert.equal(shown[0].options.tag, 'loan-loan-1');

  const notification = { data: { url: '/' }, close: () => {} };
  listeners.notificationclick({ notification, waitUntil });
  await work;
  assert.deepEqual(opened, [`${origin}/`]);
  windows = [{ url: `${origin}/`, focus: async () => (focused = true) }];
  listeners.notificationclick({ notification, waitUntil });
  await work;
  assert.ok(focused);
  assert.equal(opened.length, 1);
});
