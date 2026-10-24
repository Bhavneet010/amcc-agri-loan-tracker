import { DATA_ORIGIN, SUPABASE_KEY, SUPABASE_REGION } from './supabase-config.ts';
export type Branch = { id: string; name: string; version: number };
export type Loan = {
  id: string;
  branchId: string;
  branchName: string;
  category: 'new' | 'renewal';
  atsId: string;
  borrowerName?: string;
  amountPaise: number;
  status: 'pending' | 'sanctioned' | 'returned';
  remarks: string;
  compliance: 'none' | 'awaiting' | 'complied';
  version: number;
  createdAt: string;
  updatedAt: string;
  returnedDate?: string | null;
  returnReason?: string;
  sanctionDate?: string | null;
  statusChangedAt?: string;
  statusHistory?: {
    id: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    sourceApp: string;
    author: string;
    createdAt: string;
    returnedDate?: string;
  }[];
  shareEligible?: boolean;
  remarkHistory?: { id: string; body: string; sourceApp: string; author: string; createdAt: string }[];
};
export const rupees = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
export const lakhs = (paise: number) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(paise / 10000000)} L`;
// Branch names look like "8117 · Rajban"; the leading number is the branch code.
export const branchCode = (name: string) => name.match(/^\s*(\d+)/)?.[1] ?? name.trim().split(/[\s·-]+/)[0];
export const atsDigits = (atsId: string | null | undefined) => (atsId || '').replace(/\D/g, '');
export const dateLabel = (date: string) =>
  new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
// Drops the year for dates in the current year, so short headers fit on one line.
export const shortDateLabel = (date: string, now = new Date()) => {
  const year = (d: Date) => d.toLocaleDateString('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' });
  const sameYear = year(new Date(date)) === year(now);
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'Asia/Kolkata',
  });
};
const indiaDay = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayNumber = (date: Date) => {
  const parts = Object.fromEntries(indiaDay.formatToParts(date).map((part) => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000;
};
export const pendingDays = (createdAt: string, now = new Date()) =>
  Math.max(0, dayNumber(now) - dayNumber(new Date(createdAt)));
// Pending badges warm up as an application waits: 3 days turns amber, 6 days turns clay.
export const pendingAge = (days: number) => (days >= 6 ? 'overdue' : days >= 3 ? 'aging' : 'fresh');
const APP_ORIGIN = 'https://amcc-agri-loan-tracker.vercel.app';
export function requestUrl(url: string, method: string, appOrigin: string) {
  return method.toUpperCase() === 'GET' &&
    appOrigin === APP_ORIGIN &&
    /^\/api\/(?:branches|loans|notifications)(?:\?|$)/.test(url)
    ? DATA_ORIGIN + url
    : url;
}
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response;
  try {
    const method = (options.method || 'GET').toUpperCase();
    const target = requestUrl(url, method, typeof window === 'undefined' ? '' : window.location.origin);
    const headers = new Headers(options.headers);
    if (target.startsWith(DATA_ORIGIN + '/api/')) {
      headers.set('apikey', SUPABASE_KEY);
      headers.set('x-region', SUPABASE_REGION);
    }
    if (method !== 'GET' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    response = await fetch(target, {
      ...options,
      headers,
      cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Cannot connect. Check your connection and try again.');
  }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data.error || `Unable to complete the request (error ${response.status}). Please try again.`,
    ) as Error & { candidates?: Loan[]; status?: number };
    error.candidates = data.candidates;
    error.status = response.status;
    throw error;
  }
  return data as T;
}
