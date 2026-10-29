import { AppError } from './validation.ts';
import { base64UrlDecode, generatePushKeys, sendPush, type PushKeys, type PushSubscriptionData } from './webpush.ts';

export type PushJob = { id: string; loanId: string; branchName: string; category: string; borrowerName: string; amountPaise: number; sourceApp: string };
export interface PushStorage {
  getPushKeys(): Promise<PushKeys | null>;
  savePushKeys(keys: PushKeys): Promise<void>;
  savePushSubscription(subscription: PushSubscriptionData): Promise<void>;
  removePushSubscription(endpoint: string): Promise<void>;
  listPushSubscriptions(): Promise<PushSubscriptionData[]>;
  claimPushJobs(): Promise<PushJob[]>;
  finishPushJob(id: string): Promise<void>;
}
export const PUSH_SUBJECT = 'https://amcc-agri-loan-tracker.vercel.app';
// Browsers' own push services only; the API never posts to any other address.
const pushHost = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)$/;

function endpoint(value: unknown) {
  if (typeof value !== 'string' || value.length > 1000) throw new AppError('Invalid push subscription.');
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError('Invalid push subscription.'); }
  if (url.protocol !== 'https:' || !pushHost.test(url.hostname)) throw new AppError('This browser’s push service is not supported.');
  return value;
}
function keyBytes(value: unknown, length: number) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length > 200) return false;
  let bytes: Uint8Array;
  try { bytes = base64UrlDecode(value); } catch { return false; }
  return bytes.length === length && (length !== 65 || bytes[0] === 4);
}
export function validateSubscription(input: any): PushSubscriptionData {
  if (!input || Object.keys(input).some(k => !['endpoint', 'keys'].includes(k)) || !input.keys || typeof input.keys !== 'object' || Object.keys(input.keys).some(k => !['p256dh', 'auth'].includes(k))) throw new AppError('Invalid push subscription.');
  if (!keyBytes(input.keys.p256dh, 65) || !keyBytes(input.keys.auth, 16)) throw new AppError('Invalid push subscription keys.');
  return { endpoint: endpoint(input.endpoint), p256dh: input.keys.p256dh, auth: input.keys.auth };
}
export async function pushKeys(db: PushStorage) {
  const saved = await db.getPushKeys();
  if (saved) return saved;
  // First use: create the app's signing key. A concurrent first use keeps whichever key was stored first.
  await db.savePushKeys(await generatePushKeys());
  const stored = await db.getPushKeys();
  if (!stored) throw new Error('Push keys were not stored.');
  return stored;
}
export async function handlePush(request: Request, db: PushStorage, admin: boolean, input?: any) {
  // Removing needs no admin session, so signing out can still clear this phone after the session ends.
  if (request.method === 'DELETE') {
    if (!input || Object.keys(input).some(k => k !== 'endpoint')) throw new AppError('Invalid push subscription.');
    await db.removePushSubscription(endpoint(input.endpoint));
    return { subscribed: false };
  }
  if (!admin) throw new AppError('Admin login is required.', 401);
  if (request.method === 'GET') return { publicKey: (await pushKeys(db)).publicKey };
  await db.savePushSubscription(validateSubscription(input));
  return { subscribed: true };
}

const rupees = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
export function alertMessage(job: PushJob) {
  return {
    title: `New loan · ${job.branchName}`,
    body: `${job.borrowerName || 'Borrower name pending'} — ${job.category === 'renewal' ? 'Renewal' : 'New'} — ${rupees(job.amountPaise)}${job.sourceApp === 'nirnay' ? ' · via Nirnay' : ''}`,
    tag: `loan-${job.loanId}`,
    url: '/',
  };
}
// Sends queued new-loan alerts to every registered admin phone. A job stays queued for a retry if any phone could not be reached.
export async function deliverPushAlerts(db: PushStorage, fetcher: typeof fetch = fetch) {
  const jobs = await db.claimPushJobs();
  if (!jobs.length) return;
  const subscriptions = await db.listPushSubscriptions();
  const keys = subscriptions.length ? await pushKeys(db) : null;
  const gone = new Set<string>();
  for (const job of jobs) {
    let retry = false;
    for (const subscription of subscriptions) {
      if (gone.has(subscription.endpoint)) continue;
      try {
        const response = await sendPush(subscription, JSON.stringify(alertMessage(job)), keys!, PUSH_SUBJECT, fetcher);
        if (response.status === 404 || response.status === 410) gone.add(subscription.endpoint);
        else if (!response.ok) { retry = true; console.warn('Push alert failed', response.status); }
      } catch (error) {
        retry = true;
        console.warn('Push alert failed', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    if (!retry) await db.finishPushJob(job.id);
  }
  // The phone unsubscribed or reinstalled; it registers again when alerts are turned back on.
  for (const endpoint of gone) await db.removePushSubscription(endpoint);
}
