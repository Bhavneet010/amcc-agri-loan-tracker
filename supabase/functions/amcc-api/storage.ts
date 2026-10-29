import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config, RecordData, Storage } from './handler.ts';
import { AppError } from './validation.ts';
import {findNirnayCandidates,readNirnayMatch} from './nirnay-candidates.ts';

const CHARGE_BUCKET = 'amcc-charge-details';

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
      const [main,link] = await Promise.all([client.from('amcc_config').select('*').eq('id',true).single(),client.from('amcc_linkage_config').select('enabled').eq('id',true).single()]);
      const row=checked(main),linkage=checked(link);
      return { enabled: row.enabled, passwordSalt: row.password_salt, passwordHash: row.password_hash, sessionSecret: row.session_secret,linkageEnabled:linkage.enabled };
    },
    async listBranches() { return checked(await client.from('amcc_branches').select('id,name,version').order('id')); },
    async listLoans(filters) {
      const rows: RecordData[] = [];
      for (let offset = 0; ; offset += 1000) {
        let query = client.from('amcc_loans').select('*,amcc_branches!inner(name),amcc_remark_events(id,body,source_app,author,created_at,request_id),amcc_status_events(*),amcc_charge_details(choice,image_path,uploaded_at)').eq('agri_archived',false).order('updated_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 999);
        if (filters.branchId) query = query.eq('branch_id', filters.branchId);
        if (filters.category) query = query.eq('category', filters.category);
        const page = checked(await query); rows.push(...page.map(mapLoan));
        if (page.length < 1000) return rows;
      }
    },
    async getLoan(id) {
      const row = checked(await client.from('amcc_loans').select('*,amcc_branches!inner(name),amcc_remark_events(id,body,source_app,author,created_at,request_id),amcc_status_events(*),amcc_charge_details(choice,image_path,uploaded_at)').eq('id', id).eq('agri_archived',false).maybeSingle());
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
    async listSharedLoans() { return checked(await client.rpc('amcc_list_shared')); },
    async listNotifications(branchId, deviceId) { return checked(await client.rpc('amcc_list_notifications', { p_branch_id: branchId, p_device_id: deviceId })); },
    async setCharge(loanId, choice, image) {
      const row: RecordData = { loan_id: loanId, choice, updated_at: new Date().toISOString() };
      if (image !== undefined) Object.assign(row, { image_path: image?.path ?? null, image_bytes: image?.bytes ?? null, uploaded_at: image ? row.updated_at : null });
      checked(await client.from('amcc_charge_details').upsert(row, { onConflict: 'loan_id' }));
    },
    async clearChargeImage(loanId, path) {
      checked(await client.from('amcc_charge_details').update({ image_path: null, image_bytes: null, updated_at: new Date().toISOString() }).eq('loan_id', loanId).eq('image_path', path));
    },
    async uploadChargeImage(path, bytes, contentType) {
      const { error } = await client.storage.from(CHARGE_BUCKET).upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Charge image upload failed (${error.message}).`);
    },
    async removeChargeObject(path) {
      const { error } = await client.storage.from(CHARGE_BUCKET).remove([path]);
      if (error) throw new Error(`Charge image removal failed (${error.message}).`);
    },
    async signChargeImage(path) {
      const { data, error } = await client.storage.from(CHARGE_BUCKET).createSignedUrl(path, 300);
      if (error || !data) throw new Error(`Charge image link failed (${error?.message || 'unknown'}).`);
      return data.signedUrl;
    },
    async getPushKeys() {
      const row = checked(await client.from('amcc_push_keys').select('public_key,private_jwk').eq('id', true).maybeSingle());
      return row ? { publicKey: row.public_key, privateJwk: row.private_jwk } : null;
    },
    async savePushKeys(keys) { checked(await client.from('amcc_push_keys').upsert({ id: true, public_key: keys.publicKey, private_jwk: keys.privateJwk }, { onConflict: 'id', ignoreDuplicates: true })); },
    async savePushSubscription(subscription) {
      checked(await client.from('amcc_push_subscriptions').upsert({ endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' }));
    },
    async removePushSubscription(endpoint) { checked(await client.from('amcc_push_subscriptions').delete().eq('endpoint', endpoint)); },
    async listPushSubscriptions() { return checked(await client.from('amcc_push_subscriptions').select('endpoint,p256dh,auth')); },
    async claimPushJobs() { return checked(await client.rpc('amcc_claim_push_jobs')); },
    async finishPushJob(id) { checked(await client.from('amcc_push_outbox').delete().eq('id', id)); },
    async readNotifications(branchId, deviceId, eventIds) { return checked(await client.rpc('amcc_read_notifications', { p_branch_id: branchId, p_device_id: deviceId, p_event_ids: eventIds })); },
    async getSharedLoan(id) { return checked(await client.rpc('amcc_get_shared',{p_id:id})); },
    async createSharedLoan(input,source) {
      const payload={...input};
      if(!input.allowDistinct){
        const [branches,links]=await Promise.all([this.listBranches(),client.from('amcc_nirnay_links').select('firebase_id').not('firebase_id','is',null)]);
        const branch=branches.find(row=>row.id===input.branchId);if(!branch)throw new AppError('Choose a valid branch.');
        if(input.nirnayMatchId){payload.existingNirnay={...await readNirnayMatch(input.nirnayMatchId,{...input,branchName:branch.name}),branchId:input.branchId,borrowerName:input.borrowerName,amountPaise:input.amountPaise};}
        else {
          const candidates=await findNirnayCandidates({borrowerName:input.borrowerName,branchName:branch.name,linkedIds:checked(links).map(row=>row.firebase_id)});
          if(candidates.length)return {needsConfirmation:true,error:'An existing Nirnay application matches this borrower. Review its status before adding another application.',candidates};
        }
      }
      return checked(await client.rpc('amcc_create_shared',{p_input:payload,p_source:source}));
    },
    async updateNirnay(id,input) {
      const payload={...input};
      if (input.data.amount!==undefined) {
        const paise=Math.round(Number(input.data.amount)*10000000);
        if(!Number.isSafeInteger(paise)||paise<=0)throw new AppError('Enter a valid positive amount.');
        payload.amountPaise=paise;
      }
      if(input.data.customerName!==undefined && (typeof input.data.customerName!=='string'||!input.data.customerName.trim()||input.data.customerName.trim().length>120))throw new AppError('Enter a valid borrower name.');
      if(input.data.branch!==undefined){
        if(typeof input.data.branch!=='string')throw new AppError('Choose a valid branch.');
        const code=input.data.branch.match(/^\s*(\d+)/)?.[1];
        const branches=await this.listBranches();const branch=branches.find(b=>b.name.match(/^\s*(\d+)/)?.[1]===code);
        if(!branch)throw new AppError('Choose a valid branch.');payload.branchId=branch.id;
      }
      return checked(await client.rpc('amcc_update_nirnay',{p_id:id,p_input:payload}));
    },
  };
}
function mapLoan(row: RecordData): RecordData {
  return { id: row.id, branchId: row.branch_id, branchName: row.amcc_branches.name, category: row.category, atsId: row.ats_id||'', borrowerName: row.borrower_name, amountPaise: row.amount_paise, status: row.status, remarks: row.remarks, compliance: row.compliance, version: row.version, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),returnedDate:row.returned_date,returnReason:row.return_reason,sanctionDate:row.sanction_date,statusChangedAt:row.status_changed_at,statusHistory:(row.amcc_status_events||[]).map((e:any)=>({id:e.id,fromStatus:e.from_status,toStatus:e.to_status,reason:e.reason,returnedDate:e.returned_date,sourceApp:e.source_app,author:e.author,requestId:e.request_id,createdAt:e.created_at})).sort((a:any,b:any)=>a.createdAt.localeCompare(b.createdAt)),shareEligible:row.share_eligible,charge:chargeRow(row.amcc_charge_details),remarkHistory:(row.amcc_remark_events||[]).map((e:any)=>({id:e.id,requestId:e.request_id,body:e.body,sourceApp:e.source_app,author:e.author,createdAt:e.created_at})).sort((a:any,b:any)=>a.createdAt.localeCompare(b.createdAt)) };
}
// One-to-one embeds come back as an object; older PostgREST versions return a one-item array.
function chargeRow(value: any) {
  const row = Array.isArray(value) ? value[0] : value;
  return row ? { choice: row.choice, imagePath: row.image_path, uploadedAt: row.uploaded_at } : undefined;
}
