import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/amcc-api/handler.ts';
import { groupNotifications, notificationDeviceId } from '../lib/notifications.ts';
import { requestUrl } from '../lib/types.ts';
import { proxyRequest } from '../lib/proxy.ts';

const origin = 'https://amcc-agri-loan-tracker.vercel.app';
const deviceId = '35a12e83-72ca-4934-b947-bb64936bb288';
const eventId = 'e4a539bc-e962-48c6-92df-67d9174166fd';
function fixture() {
  const calls: unknown[] = [];
  const db: any = {
    getConfig: async () => ({ enabled: true }),
    listNotifications: async (...args: unknown[]) => { calls.push(args); return { items: [], hasMore: false }; },
    readNotifications: async (...args: unknown[]) => { calls.push(args); return { read: 1 }; },
  };
  const handler = createHandler(db, 'test-key');
  const send = (query: string, method = 'GET', data?: unknown) => handler(new Request('https://project.supabase.co/api/notifications' + query, { method, headers: { apikey: 'test-key', origin, ...(data ? { 'content-type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }));
  return { calls, send };
}
test('notification feed requires valid branch and installation IDs and stays uncached', async () => {
  const { calls, send } = fixture();
  for (const query of ['', '?branchId=branch-99&deviceId=' + deviceId, '?branchId=branch-01&deviceId=invalid']) assert.equal((await send(query)).status, 400);
  const result = await send('?branchId=branch-01&deviceId=' + deviceId);
  assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls, [['branch-01', deviceId]]);
});
test('mark as read acknowledges explicit IDs for one device and validates bounded batches', async () => {
  const { calls, send } = fixture();
  const data = { branchId: 'branch-01', deviceId, eventIds: [eventId] };
  for (const bad of [{ ...data, eventIds: [] }, { ...data, eventIds: Array(51).fill(eventId) }, { ...data, eventIds: ['invalid'] }, { ...data, extra: true }]) assert.equal((await send('', 'POST', bad)).status, 400);
  assert.equal((await send('', 'POST', data)).status, 200);
  assert.deepEqual(calls, [['branch-01', deviceId, [eventId]]]);
  assert.equal((await send('', 'DELETE')).status, 405);
});
test('popup groups updates by loan without discarding intermediate remarks or decisions', () => {
  const events: any[] = [{ id: 'a', loanId: 'loan-1', remarks: 'First' }, { id: 'b', loanId: 'loan-2', remarks: 'Other' }, { id: 'c', loanId: 'loan-1', remarks: 'Second', statusChanged: true }];
  assert.deepEqual(groupNotifications(events).map(group => group.events.map(e => e.id)), [['a', 'c'], ['b']]);
});
test('installation ID persists independently of branch and malformed storage is replaced', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const first = notificationDeviceId(storage);
  assert.match(first, /^[0-9a-f-]{36}$/); assert.equal(notificationDeviceId(storage), first);
  values.set('amcc.notifications.device.v1', 'bad'); assert.notEqual(notificationDeviceId(storage), first);
  assert.throws(() => notificationDeviceId({ getItem() { throw new Error('Storage blocked'); }, setItem() {} }));
});
test('notification reads bypass production gateway and acknowledgements use the same-origin gateway', async () => {
  assert.match(requestUrl('/api/notifications?branchId=branch-01&deviceId=' + deviceId, 'GET', origin), /functions\/v1\/amcc-api\/api\/notifications/);
  assert.equal(requestUrl('/api/notifications', 'POST', origin), '/api/notifications');
  let target = '';
  const response = await proxyRequest(new Request(origin + '/api/notifications', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ branchId: 'branch-01', deviceId, eventIds: [eventId] }) }), async url => { target = String(url); return Response.json({ read: 1 }); });
  assert.equal(response.status, 200); assert.ok(target.endsWith('/api/notifications'));
});
