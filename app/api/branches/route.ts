import { body, handled, json, runtime } from '../../../lib/api';
import { listBranches, renameBranch } from '../../../lib/loan-service';
import { ensureSameOrigin, isAdmin } from '../../../lib/admin-auth';
import { AppError } from '../../../lib/loan-validation';
export const dynamic = 'force-dynamic';
export function GET() { return handled(async () => json(await listBranches(runtime().DB))); }
export function PATCH(request: Request) { return handled(async () => {
  ensureSameOrigin(request); const config = runtime();
  if (!await isAdmin(request, config.ADMIN_SESSION_SECRET)) throw new AppError('Admin login is required.', 401);
  const input = await body(request);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80 || !/^branch-(0[1-9]|1[0-3])$/.test(input.id)) throw new AppError('Enter a valid branch name of 1–80 characters.');
  return json(await renameBranch(config.DB, input.id, name, input.version));
}); }
