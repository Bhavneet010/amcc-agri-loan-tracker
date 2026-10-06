import { env } from 'cloudflare:workers';
import { AppError } from './loan-validation.ts';
export function runtime() {
  const runtimeEnv = env as any;
  if (!runtimeEnv.DB) throw new AppError('Shared database is unavailable. Please try again shortly.', 503);
  return runtimeEnv as { DB: D1Database; ADMIN_PASSWORD_SALT: string; ADMIN_PASSWORD_HASH: string; ADMIN_SESSION_SECRET: string };
}
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}
export async function handled(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request data.' }, 400);
    console.error('AMCC request failed', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Unable to save or load data. Please try again.' }, 500);
  }
}
export async function body(request: Request) {
  const text = await request.text();
  if (text.length > 8192) throw new AppError('Request is too large.', 413);
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('Invalid request data.');
  return data;
}
