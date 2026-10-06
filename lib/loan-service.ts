import { AppError, validateLoanInput, publicChanges, adminChanges } from './loan-validation.ts';
import { branchDirectory } from './branch-directory.ts';
const columns = `l.id, l.branch_id AS branchId, b.name AS branchName, l.category, l.ats_id AS atsId,
 l.amount_paise AS amountPaise, l.status, l.remarks, l.compliance, l.version,
 l.created_at AS createdAt, l.updated_at AS updatedAt`;
const select = `SELECT ${columns} FROM loans l JOIN branches b ON b.id = l.branch_id`;
export async function seedBranches(db: D1Database) {
  const count: any = await db.prepare('SELECT COUNT(*) AS count FROM branches').first();
  if (count.count === 13) return;
  await db.batch(Array.from({ length: 13 }, (_, i) => {
    const number = String(i + 1).padStart(2, '0');
    return db.prepare('INSERT OR IGNORE INTO branches (id, name) VALUES (?, ?)').bind(`branch-${number}`, `${branchDirectory[i][0]} · ${branchDirectory[i][1]}`);
  }));
}
export async function listBranches(db: D1Database) {
  await seedBranches(db);
  return (await db.prepare('SELECT id, name, version FROM branches ORDER BY id').all()).results;
}
export async function renameBranch(db: D1Database, id: string, name: string, version: number) {
  if (!/^branch-(0[1-9]|1[0-3])$/.test(id) || !name.trim() || name.trim().length > 80 || !Number.isSafeInteger(version) || version < 1) throw new AppError('Enter a valid branch name and version.');
  let result;
  try { result = await db.prepare('UPDATE branches SET name = ?, version = version + 1 WHERE id = ? AND version = ?').bind(name.trim(), id, version).run(); }
  catch (error) { if (/UNIQUE/i.test(String(error))) throw new AppError('Another branch already uses that name.', 409); throw error; }
  if (Number(result.meta.changes) !== 1) throw new AppError('This branch was renamed by someone else. Reload the latest name and try again.', 409);
  return listBranches(db);
}
export async function listLoans(db: D1Database, filters: { branchId?: string; category?: string } = {}) {
  const clauses: string[] = []; const values: string[] = [];
  if (filters.branchId) { clauses.push('l.branch_id = ?'); values.push(filters.branchId); }
  if (filters.category) { clauses.push('l.category = ?'); values.push(filters.category); }
  return (await db.prepare(select + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') + ' ORDER BY l.updated_at DESC, l.id DESC').bind(...values).all()).results as any[];
}
export async function getLoan(db: D1Database, id: string): Promise<any> {
  const row = await db.prepare(select + ' WHERE l.id = ?').bind(id).first();
  if (!row) throw new AppError('Loan not found.', 404);
  return row;
}
function databaseError(error: any): never {
  if (/UNIQUE constraint failed/i.test(String(error))) throw new AppError('This ATS number already exists in this branch and tab.', 409);
  throw error;
}
export async function createLoan(db: D1Database, input: any) {
  if (Object.keys(input).some(k => !['branchId', 'category', 'atsId', 'amount'].includes(k))) throw new AppError('Invalid loan fields.');
  if (!['new', 'renewal'].includes(input.category)) throw new AppError('Choose New or Renewal.');
  if (typeof input.branchId !== 'string' || !await db.prepare('SELECT id FROM branches WHERE id = ?').bind(input.branchId).first()) throw new AppError('Choose a valid branch.');
  const { atsId, amountPaise } = validateLoanInput(input);
  const id = crypto.randomUUID(); const time = new Date().toISOString();
  try {
    await db.batch([
      db.prepare('INSERT INTO loans (id, branch_id, category, ats_id, amount_paise, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, input.branchId, input.category, atsId, amountPaise, time, time),
      db.prepare('INSERT INTO audit (id, loan_id, actor, changes, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, 'branch', JSON.stringify({ action: 'create', branchId: input.branchId, category: input.category, atsId, amountPaise }), time),
    ]);
  } catch (error) { databaseError(error); }
  return getLoan(db, id);
}
export async function updateLoan(db: D1Database, id: string, expectedVersion: number, input: any, admin: boolean) {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new AppError('A record version is required.');
  const record = await getLoan(db, id);
  if (record.version !== expectedVersion) throw new AppError('This loan was updated by someone else. Refresh and try again.', 409);
  const changes = admin ? adminChanges(input) : publicChanges(record, input);
  if ('remarks' in changes && changes.remarks !== record.remarks) changes.compliance = changes.remarks ? 'awaiting' : 'none';
  const names: Record<string, string> = { atsId: 'ats_id', amountPaise: 'amount_paise', remarks: 'remarks', status: 'status', compliance: 'compliance' };
  const time = new Date().toISOString();
  const assignments = Object.keys(changes).map(k => names[k] + ' = ?');
  let results;
  try {
    results = await db.batch([
      db.prepare(`UPDATE loans SET ${assignments.join(', ')}, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`).bind(...Object.values(changes), time, id, expectedVersion),
      db.prepare('INSERT INTO audit (id, loan_id, actor, changes, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1').bind(crypto.randomUUID(), id, admin ? 'admin' : 'branch', JSON.stringify(changes), time),
    ]);
  } catch (error) { databaseError(error); }
  if (Number(results![0].meta.changes) !== 1) throw new AppError('This loan was updated by someone else. Refresh and try again.', 409);
  return getLoan(db, id);
}
