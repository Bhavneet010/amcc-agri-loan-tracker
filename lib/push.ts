import { request } from './types.ts';

// New-loan alerts for the admin's phone. Each phone registers its own browser push subscription,
// so only phones where an admin turned alerts on receive them.
export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

export function base64UrlToBytes(value: string) {
  const binary = atob(
    value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '='),
  );
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export function sameKey(current: ArrayBuffer | null | undefined, publicKey: string) {
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = base64UrlToBytes(publicKey);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration() {
  return navigator.serviceWorker.getRegistration('/');
}
async function register(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON();
  await request('/api/admin/push', {
    method: 'POST',
    body: JSON.stringify({ endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth } }),
  });
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const subscription = await (await registration())?.pushManager.getSubscription();
  return subscription && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePushAlerts() {
  if (!pushSupported()) throw new Error('This browser cannot show phone alerts.');
  const reg = await registration();
  if (!reg) throw new Error('Install the app or reload it once, then try again.');
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('Notifications are blocked. Allow them for this app in the phone’s settings.');
  const { publicKey } = await request<{ publicKey: string }>('/api/admin/push');
  let subscription = await reg.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
  await register(subscription);
}

export async function disablePushAlerts() {
  if (!pushSupported()) return;
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (!subscription) return;
  // Unsubscribing locally also stops delivery: the server forgets an endpoint once the push service reports it gone.
  try {
    await request('/api/admin/push', { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) });
  } finally {
    await subscription.unsubscribe();
  }
}

// Re-registers this phone when the admin opens the app, in case the server dropped an expired registration.
export async function syncPushAlerts() {
  if ((await pushState()) !== 'on') return;
  const subscription = await (await registration())?.pushManager.getSubscription();
  if (subscription) await register(subscription);
}
