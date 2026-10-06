export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function validateLoanInput(input: any) {
  const atsId = typeof input.atsId === 'string' ? input.atsId.trim() : '';
  if (!atsId || atsId.length > 80) throw new AppError('Enter an ATS number of 1–80 characters.');
  const amount = String(input.amount ?? '');
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new AppError('Enter a positive amount with at most two decimal places.');
  const [whole, fraction = ''] = amount.split('.');
  const amountPaise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new AppError('Enter a valid positive loan amount.');
  return { atsId, amountPaise };
}
export function publicChanges(record: any, input: any): Record<string, any> {
  const keys = Object.keys(input);
  if (!keys.length || keys.some(k => !['atsId', 'amount', 'compliance'].includes(k))) throw new AppError('This action requires admin access.', 403);
  if ('compliance' in input) {
    if (keys.length !== 1 || !record.remarks || !['complied', 'awaiting'].includes(input.compliance)) throw new AppError('There are no current remarks to comply with.');
    return { compliance: input.compliance };
  }
  if (record.status !== 'pending') throw new AppError('Sanctioned loans cannot be edited.', 403);
  return validateLoanInput(input);
}
export function adminChanges(input: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!Object.keys(input).length || Object.keys(input).some(k => !['remarks', 'status'].includes(k))) throw new AppError('Invalid admin update.');
  if ('status' in input) {
    if (!['pending', 'sanctioned'].includes(input.status)) throw new AppError('Invalid loan status.');
    result.status = input.status;
  }
  if ('remarks' in input) {
    if (typeof input.remarks !== 'string' || input.remarks.length > 2000) throw new AppError('Remarks must be at most 2,000 characters.');
    result.remarks = input.remarks.trim();
  }
  return result;
}
