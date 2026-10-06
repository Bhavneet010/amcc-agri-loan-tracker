import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { seedBranches, createLoan, updateLoan, listLoans, renameBranch } from '../lib/loan-service.ts';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql'))) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  const wrap = (sql: string, args: any[] = []) => ({
    bind: (...params: any[]) => wrap(sql, params),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
  });
  return { prepare: wrap, batch: async (statements: any[]) => {
    sqlite.exec('BEGIN');
    try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result; }
    catch(e) { sqlite.exec('ROLLBACK'); throw e; }
  } };
}
test('thirteen branches, duplicate prevention, optimistic edits and compliance reset', async () => {
  const db: any = database();
  await seedBranches(db); await seedBranches(db);
  assert.equal((await db.prepare('SELECT * FROM branches').all()).results.length, 13);
  assert.equal((await db.prepare('SELECT name FROM branches WHERE id = ?').bind('branch-01').first()).name, '2413 · MAJRA');
  const loan = await createLoan(db, { branchId: 'branch-01', category: 'new', atsId: 'ATS-100', amount: '250000' });
  assert.equal(loan.status, 'pending');
  await assert.rejects(createLoan(db, { branchId: 'branch-01', category: 'new', atsId: 'ATS-100', amount: '1' }), /already exists/);
  assert.equal((await listLoans(db, { branchId: 'branch-02' })).length, 0);
  assert.equal((await listLoans(db, { category: 'renewal' })).length, 0);
  const remarked = await updateLoan(db, loan.id, 1, { remarks: 'Land records required' }, true);
  assert.equal(remarked.compliance, 'awaiting');
  const complied = await updateLoan(db, loan.id, 2, { compliance: 'complied' }, false);
  assert.equal(complied.status, 'pending');
  await assert.rejects(updateLoan(db, loan.id, 2, { compliance: 'awaiting' }, false), /updated by someone else/);
  const revised = await updateLoan(db, loan.id, 3, { remarks: 'Updated land records required' }, true);
  assert.equal(revised.compliance, 'awaiting');
  const sanctioned = await updateLoan(db, loan.id, 4, { status: 'sanctioned' }, true);
  assert.equal(sanctioned.status, 'sanctioned');
  await assert.rejects(updateLoan(db, loan.id, 5, { atsId: 'B', amount: '2' }, false), /cannot be edited/);
  await assert.rejects(updateLoan(db, loan.id, 5, { status: 'pending' }, false), /admin access/);
  await renameBranch(db, 'branch-01', 'My branch', 1);
  await assert.rejects(renameBranch(db, 'branch-01', 'Overwritten', 1), /renamed by someone else/);
  assert.equal((await listLoans(db, { branchId: 'branch-01' }))[0].branchName, 'My branch');
  assert.equal((await db.prepare('SELECT * FROM audit').all()).results.length, 5);
});
