import { proxyRequest } from '../../../../lib/proxy';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => proxyRequest(request);
export const PATCH = (request: Request) => proxyRequest(request);
export const DELETE = (request: Request) => proxyRequest(request);
