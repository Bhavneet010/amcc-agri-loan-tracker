import { AppError } from './loan-validation.ts';
const encoder = new TextEncoder();
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), b => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
function equal(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}
export async function signSession(secret: string, expiry = Date.now() + 8 * 60 * 60 * 1000) {
  const payload = `${expiry}:${crypto.randomUUID()}`;
  return `${payload}.${await hmac(secret, payload)}`;
}
export async function validSession(token: string, secret: string) {
  if (!token || !secret || token.length > 256) return false;
  const [payload, signature, extra] = token.split('.');
  const expiry = Number(payload?.split(':')[0]);
  if (extra || !signature || !Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 8 * 60 * 60 * 1000 + 1000) return false;
  return equal(signature, await hmac(secret, payload));
}
export async function verifyPassword(password: string, salt: string, hash: string) {
  if (typeof password !== 'string' || !password || password.length > 256 || !salt || !hash) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return equal(hex(derived), hash);
}
export function ensureSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new AppError('Request origin is not allowed.', 403);
}
export function cookieToken(request: Request) {
  return request.headers.get('cookie')?.split(';').map(c => c.trim()).find(c => c.startsWith('amcc_admin='))?.slice(11) ?? '';
}
export async function isAdmin(request: Request, secret: string) {
  return validSession(cookieToken(request), secret);
}
export function sessionCookie(request: Request, token: string, logout = false) {
  return `amcc_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${logout ? 0 : 28800}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
