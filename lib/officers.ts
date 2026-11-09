import type { Loan } from './types.ts';
import { branchCode } from './types.ts';

// Loan cell officers and the branches allocated to each, keyed by branch code.
// Mirrors the allocation used in the Nirnay app; update both together when it changes.
export const officers = ['Anil Kumar', 'Nikita', 'Vibhor'] as const;
export const unassignedOfficer = 'Unassigned';
export const branchOfficers: Record<string, string> = {
  '2413': 'Anil Kumar', // Majra
  '3399': 'Anil Kumar', // Rajban
  '4590': 'Anil Kumar', // Kala Amb
  '686': 'Anil Kumar', // Nahan
  '7459': 'Anil Kumar', // Kafota
  '4589': 'Nikita', // SME Taruwala
  '6784': 'Nikita', // Dhaula Kuan
  '50536': 'Nikita', // Bhagani
  '50569': 'Nikita', // Timbi
  '63982': 'Nikita', // Shillai
  '1680': 'Vibhor', // ADB Paonta Sahib
  '1755': 'Vibhor', // Paonta Sahib
  '8117': 'Vibhor', // Rajpur
};
export const officerForBranch = (branchName: string) => branchOfficers[branchCode(branchName)] || unassignedOfficer;

export type GroupMode = 'none' | 'officer' | 'date';
export const groupModes: { id: GroupMode; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'officer', label: 'Officer' },
  { id: 'date', label: 'Received date' },
];
export type LoanGroup = { key: string; label: string; loans: Loan[]; amountPaise: number };

const indiaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
// YYYY-MM-DD of the day the application was received, in India time.
export const receivedDay = (loan: Pick<Loan, 'createdAt'>) => indiaDate.format(new Date(loan.createdAt));
const dayLabel = (day: string, now: Date) => {
  const today = indiaDate.format(now);
  const yesterday = indiaDate.format(new Date(now.getTime() - 86400000));
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  const date = new Date(`${day}T12:00:00+05:30`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'Asia/Kolkata',
  });
};

/** Splits loans into sections, keeping each loan's order within its section. */
export function groupLoans(loans: Loan[], mode: Exclude<GroupMode, 'none'>, now = new Date()): LoanGroup[] {
  const map = new Map<string, Loan[]>();
  for (const loan of loans) {
    const key = mode === 'officer' ? officerForBranch(loan.branchName) : receivedDay(loan);
    map.set(key, [...(map.get(key) || []), loan]);
  }
  const keys = [...map.keys()];
  if (mode === 'officer') {
    const rank = (k: string) => (k === unassignedOfficer ? Infinity : (officers as readonly string[]).indexOf(k));
    keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  } else keys.sort((a, b) => b.localeCompare(a));
  return keys.map((key) => {
    const list = map.get(key)!;
    return {
      key,
      label: mode === 'officer' ? key : dayLabel(key, now),
      loans: list,
      amountPaise: list.reduce((sum, loan) => sum + loan.amountPaise, 0),
    };
  });
}
