import type { Loan } from './types';

export type SummaryPeriod = 'today' | 'month' | 'all';
const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (date: Date) => indiaDate.format(date);

export function summarizeLoans(loans: Loan[], period: SummaryPeriod, now: Date) {
  const today = dayKey(now);
  const counts = { pending: 0, sanctioned: 0 };
  for (const loan of loans) {
    if (period !== 'all') {
      const date = new Date(loan.status === 'sanctioned' ? loan.updatedAt : loan.createdAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = dayKey(date);
      // A loan still pending from an earlier day or month carries forward into the current period.
      const carried = loan.status === 'pending' && key < today;
      if (!carried && (period === 'today' ? key !== today : key.slice(0, 7) !== today.slice(0, 7))) continue;
    }
    counts[loan.status]++;
  }
  return counts;
}
