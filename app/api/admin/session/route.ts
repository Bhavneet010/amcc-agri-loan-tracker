import { body, handled, json, runtime } from '../../../../lib/api';
import { ensureSameOrigin, isAdmin, sessionCookie, signSession, verifyPassword } from '../../../../lib/admin-auth';
import { AppError } from '../../../../lib/loan-validation';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return handled(async () => json({ admin: await isAdmin(request, runtime().ADMIN_SESSION_SECRET) })); }
export function POST(request: Request) { return handled(async () => {
  ensureSameOrigin(request); const config = runtime();
  if (!config.ADMIN_PASSWORD_HASH || !config.ADMIN_PASSWORD_SALT || !config.ADMIN_SESSION_SECRET) throw new AppError('Admin login has not been configured.', 503);
  const { password } = await body(request);
  const ip = request.headers.get('cf-connecting-ip') || 'unidentified';
  const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const key = Array.from(new Uint8Array(keyBytes), b => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now(); const cutoff = now - 15 * 60 * 1000;
  const attempt: any = await config.DB.prepare(`INSERT INTO login_attempts (key, attempts, window_start) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END,
    window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END RETURNING attempts`).bind(key, now, cutoff, cutoff, now).first();
  if (attempt.attempts > 5) throw new AppError('Too many login attempts. Try again in 15 minutes.', 429);
  if (!await verifyPassword(password, config.ADMIN_PASSWORD_SALT, config.ADMIN_PASSWORD_HASH)) throw new AppError('Incorrect admin password.', 401);
  await config.DB.prepare('DELETE FROM login_attempts WHERE key = ? OR window_start < ?').bind(key, cutoff).run();
  return json({ admin: true }, 200, { 'Set-Cookie': sessionCookie(request, await signSession(config.ADMIN_SESSION_SECRET)) });
}); }
export function DELETE(request: Request) { return handled(async () => {
  ensureSameOrigin(request); return json({ admin: false }, 200, { 'Set-Cookie': sessionCookie(request, '', true) });
}); }
