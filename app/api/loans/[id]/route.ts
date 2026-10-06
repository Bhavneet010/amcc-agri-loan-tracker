import { body, handled, json, runtime } from '../../../../lib/api';
import { updateLoan, getLoan } from '../../../../lib/loan-service';
import { ensureSameOrigin, isAdmin } from '../../../../lib/admin-auth';
import { AppError } from '../../../../lib/loan-validation';
export const dynamic = 'force-dynamic';
export function GET(_request: Request, context: { params: Promise<{ id: string }> }) { return handled(async () => json(await getLoan(runtime().DB, (await context.params).id))); }
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { return handled(async () => {
  ensureSameOrigin(request); const config = runtime();
  const { version, ...changes } = await body(request);
  const admin = await isAdmin(request, config.ADMIN_SESSION_SECRET);
  if (('remarks' in changes || 'status' in changes) && !admin) throw new AppError('Admin login is required.', 401);
  // A logged-in admin can still correct a pending loan or mark compliance through the branch workflow.
  const adminUpdate = 'remarks' in changes || 'status' in changes;
  return json(await updateLoan(config.DB, (await context.params).id, version, changes, admin && adminUpdate));
}); }
