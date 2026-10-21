import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('online home navigation returns the latest page instead of the cached page', async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const cache = { put: async () => {} };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { origin: 'https://example.test' },
      addEventListener: (name: string, handler: (event: any) => void) => { listeners[name] = handler; },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { match: async () => 'old page', open: async () => cache },
    fetch: async () => ({ ok: true, clone: () => 'copy', text: () => 'new page' }),
    URL,
  });
  let response: Promise<any> | undefined;
  listeners.fetch({
    request: { url: 'https://example.test/', method: 'GET', mode: 'navigate' },
    respondWith: (value: Promise<any>) => { response = value; },
    waitUntil: () => {},
  });
  assert.equal(await response?.then(value => typeof value === 'string' ? value : value.text()), 'new page');
});
