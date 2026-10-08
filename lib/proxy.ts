const DATA_ORIGIN = 'https://amcc-agri-loans.bhavneet.chatgpt.site';
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Upstream issues the admin cookie as a browser-session cookie, which phones drop when the app is closed.
// Give it a lifetime so this device stays signed in as admin until sign-out.
function persistAdminCookie(cookie: string) {
  return /;\s*(max-age|expires)=/i.test(cookie) ? cookie : `${cookie}; Max-Age=${ADMIN_COOKIE_MAX_AGE}`;
}

function upstreamError(method: string, status: number) {
  if (method === 'DELETE' && (status === 404 || status === 405 || status === 501)) return 'The shared loan service doesn’t support deleting applications yet, so nothing was removed.';
  return `The shared loan service returned an error (${status}). Please try again.`;
}

export async function proxyRequest(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (!/^\/api\/(branches|loans(?:\/[^/]+)?|admin\/session)$/.test(url.pathname)) {
    return Response.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return Response.json({ error: 'Method not allowed.' }, { status: 405 });
  }
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) {
    return Response.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const contentType = request.headers.get('content-type');
  if (cookie) headers.set('cookie', cookie);
  if (contentType) headers.set('content-type', contentType);
  if (request.method !== 'GET') headers.set('origin', DATA_ORIGIN);

  try {
    const upstream = await fetcher(DATA_ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === 'GET' ? undefined : await request.text(),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    const responseType = upstream.headers.get('content-type');
    if (responseType) responseHeaders.set('content-type', responseType);
    const login = url.pathname === '/api/admin/session' && request.method === 'POST' && upstream.ok;
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append('set-cookie', login ? persistAdminCookie(cookie) : cookie);
    if (!upstream.ok && !responseType?.includes('application/json')) {
      // The data service answered with a non-JSON error (or a redirect); log it and give the app a readable message.
      const detail = (await upstream.text().catch(() => '')).slice(0, 300);
      console.warn(`[gateway] ${request.method} ${url.pathname} -> ${upstream.status} ${upstream.headers.get('location') ?? ''} ${detail}`);
      return Response.json({ error: upstreamError(request.method, upstream.status) }, { status: upstream.status >= 400 ? upstream.status : 502, headers: { 'cache-control': 'no-store' } });
    }
    if (!upstream.ok) console.warn(`[gateway] ${request.method} ${url.pathname} -> ${upstream.status}`);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ error: 'Shared loan service is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
