import type { Loan } from './types.ts';
export function upsertLoan(rows: Loan[], saved: Loan, branchId: string): Loan[] {
  if (branchId && saved.branchId !== branchId) return rows.filter(row => row.id !== saved.id);
  const previous = rows.find(row => row.id === saved.id);
  if (previous && previous.version > saved.version) return rows;
  return previous ? rows.map(row => row.id === saved.id ? saved : row) : [saved, ...rows];
}
