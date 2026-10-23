import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config, RecordData, Storage } from './handler.ts';
import { AppError } from './validation.ts';

function checked<T>(result: { data: T; error: any }): NonNullable<T> {
  if (result.error) {
    const { code, message } = result.error;
    if (code === '23505') throw new AppError('This ATS number or branch name already exists.', 409);
    if (code === 'P0001') throw new AppError(message, /not found/i.test(message) ? 404 : /admin/i.test(message) ? 401 : /version|updated by|renamed by/i.test(message) ? 409 : 400);
    if (['22P02', '23514', '23503'].includes(code)) throw new AppError('Invalid loan or branch data.');
    throw new Error(`Database request failed (${code || 'unknown'}).`);
  }
  return result.data as NonNullable<T>;
}
export function createStorage(client: SupabaseClient): Storage {
  return {
    async getConfig(): Promise<Config> {
      const row = checked(await client.from('amcc_config').select('*').eq('id', true).single());
      return { enabled: row.enabled, passwordSalt: row.password_salt, passwordHash: row.password_hash, sessionSecret: row.session_secret };
    },
    async listBranches() { return checked(await client.from('amcc_branches').select('id,name,version').order('id')); },
    async listLoans(filters) {
      const rows: RecordData[] = [];
      for (let offset = 0; ; offset += 1000) {
        let query = client.from('amcc_loans').select('*,amcc_branches!inner(name)').order('updated_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 999);
        if (filters.branchId) query = query.eq('branch_id', filters.branchId);
        if (filters.category) query = query.eq('category', filters.category);
        const page = checked(await query); rows.push(...page.map(mapLoan));
        if (page.length < 1000) return rows;
      }
    },
    async getLoan(id) {
      const row = checked(await client.from('amcc_loans').select('*,amcc_branches!inner(name)').eq('id', id).maybeSingle());
      if (!row) throw new AppError('Loan not found.', 404);
      return mapLoan(row);
    },
    async createLoan(input) { return checked(await client.rpc('amcc_mutate_loan', { p_operation: 'create', p_id: crypto.randomUUID(), p_version: 0, p_changes: input, p_actor: 'branch' })); },
    async updateLoan(id, version, changes, actor) { return checked(await client.rpc('amcc_mutate_loan', { p_operation: 'update', p_id: id, p_version: version, p_changes: changes, p_actor: actor })); },
    async deleteLoan(id, version, admin) { checked(await client.rpc('amcc_mutate_loan', { p_operation: 'delete', p_id: id, p_version: version, p_changes: {}, p_actor: admin ? 'admin' : 'branch' })); },
    async renameBranch(id, name, version) {
      checked(await client.rpc('amcc_rename_branch', { p_id: id, p_name: name, p_version: version }));
      return this.listBranches();
    },
    async loginAttempt(key) { return checked(await client.rpc('amcc_login_attempt', { p_key: key })); },
    async clearLoginAttempts(key) { checked(await client.from('amcc_login_attempts').delete().eq('key', key)); },
  };
}
function mapLoan(row: RecordData): RecordData {
  return { id: row.id, branchId: row.branch_id, branchName: row.amcc_branches.name, category: row.category, atsId: row.ats_id, borrowerName: row.borrower_name, amountPaise: row.amount_paise, status: row.status, remarks: row.remarks, compliance: row.compliance, version: row.version, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
