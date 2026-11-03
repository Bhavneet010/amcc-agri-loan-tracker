import type { Loan } from './types';

export type SummaryPeriod = 'today' | 'month' | 'all';
export const periodLabels: Record<SummaryPeriod, string> = { today: 'Today', month: 'This Month', all: 'All Time' };
const indiaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayKey = (date: Date) => indiaDate.format(date);

/**
 * Whether a loan belongs to a summary period. The carousel counts and the list filter both use this, so the number
 * on a summary box always matches the rows shown when it is tapped.
 */
export function loanInPeriod(loan: Loan, period: SummaryPeriod, now: Date) {
  if (period === 'all') return true;
  const today = dayKey(now);
  const date = new Date(
    loan.status === 'returned'
      ? loan.returnedDate || loan.statusChangedAt || loan.updatedAt
      : loan.status === 'sanctioned'
        ? loan.sanctionDate || loan.updatedAt
        : loan.createdAt,
  );
  if (Number.isNaN(date.getTime())) return false;
  const key = dayKey(date);
  // A loan still pending from an earlier day or month carries forward into the current period.
  if (loan.status === 'pending' && key < today) return true;
  return period === 'today' ? key === today : key.slice(0, 7) === today.slice(0, 7);
}

export function summarizeLoans(loans: Loan[], period: SummaryPeriod, now: Date) {
  const counts = { pending: 0, sanctioned: 0, returned: 0 };
  for (const loan of loans) if (loanInPeriod(loan, period, now)) counts[loan.status]++;
  return counts;
}
