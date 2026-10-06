import { body, handled, json, runtime } from '../../../lib/api';
import { createLoan, listLoans, seedBranches } from '../../../lib/loan-service';
import { ensureSameOrigin } from '../../../lib/admin-auth';
import { AppError } from '../../../lib/loan-validation';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return handled(async () => {
  const params = new URL(request.url).searchParams;
  return json(await listLoans(runtime().DB, { branchId: params.get('branchId') || undefined, category: params.get('category') || undefined }));
}); }
export function POST(request: Request) { return handled(async () => {
  ensureSameOrigin(request); const db = runtime().DB; await seedBranches(db);
  const input = await body(request);
  if (!input.branchId) throw new AppError('Select a branch first.');
  return json(await createLoan(db, input), 201);
}); }
