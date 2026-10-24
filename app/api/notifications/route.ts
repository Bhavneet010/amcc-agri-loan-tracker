import { proxyRequest } from '../../../lib/proxy';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => proxyRequest(request);
export const POST = (request: Request) => proxyRequest(request);
