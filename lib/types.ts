export type Branch = { id: string; name: string; version: number };
export type Loan = {
  id: string; branchId: string; branchName: string; category: 'new' | 'renewal'; atsId: string;
  amountPaise: number; status: 'pending' | 'sanctioned'; remarks: string;
  compliance: 'none' | 'awaiting' | 'complied'; version: number; createdAt: string; updatedAt: string;
};
export const rupees = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
export const lakhs = (paise: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(paise / 10000000)} L`;
// Branch names look like "8117 · Rajban"; the leading number is the branch code.
export const branchCode = (name: string) => name.match(/^\s*(\d+)/)?.[1] ?? name.trim().split(/[\s·-]+/)[0];
export const atsDigits = (atsId: string) => atsId.replace(/\D/g, '');
export const dateLabel = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
export async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  let response;
  try {
    response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(15000) });
  } catch { throw new Error('Cannot connect. Check your connection and try again.'); }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to complete the request. Please try again.');
  return data as T;
}
