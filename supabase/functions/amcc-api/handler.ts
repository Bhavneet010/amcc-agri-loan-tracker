import { AppError, validateLoanInput, publicChanges, adminChanges,validateDecision } from './validation.ts';
import { isAdmin, sessionCookie, signSession, verifyPassword } from './auth.ts';
import { handleLinkage, validateSharedCreate, type LinkStorage } from './linkage.ts';

export type Config = { enabled: boolean; passwordSalt: string; passwordHash: string; sessionSecret: string; linkageEnabled?: boolean };
export type RecordData = Record<string, any>;
export interface Storage {
  getConfig(): Promise<Config>;
  listBranches(): Promise<RecordData[]>;
  listLoans(filters: { branchId?: string; category?: string }): Promise<RecordData[]>;
  getLoan(id: string): Promise<RecordData>;
  createLoan(input: RecordData): Promise<RecordData>;
  updateLoan(id: string, version: number, changes: RecordData, actor: string): Promise<RecordData>;
  deleteLoan(id: string, version: number, admin: boolean): Promise<void>;
  renameBranch(id: string, name: string, version: number): Promise<RecordData[]>;
  loginAttempt(key: string): Promise<number>;
  clearLoginAttempts(key: string): Promise<void>;
  listSharedLoans?: LinkStorage['listSharedLoans'];
  getSharedLoan?: LinkStorage['getSharedLoan'];
  createSharedLoan?: LinkStorage['createSharedLoan'];
  updateNirnay?: LinkStorage['updateNirnay'];
}
const allowedOrigins = new Set(['https://amcc-agri-loan-tracker.vercel.app', 'https://amcc-agri-loans.bhavneet.chatgpt.site', 'https://loan-tracker-xi.vercel.app', 'https://xebnciawqwscifzgrkbu.supabase.co']);
const publicLoan = (row: RecordData) => row.status === 'sanctioned' && !row.shareEligible ? { ...row, remarks: '', compliance: 'none' } : row;
function version(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new AppError('A record version is required.');
}
async function body(request: Request): Promise<RecordData> {
  // Bound bytes while streaming, before allocating the complete request body.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new AppError('Request is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('Invalid request data.');
  return data;
}

export function createHandler(db: Storage, publicKeys: string | string[]) {
  const keys = Array.isArray(publicKeys) ? publicKeys : [publicKeys];
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^.*\/amcc-api(?=\/)/, '');
    const origin = request.headers.get('origin') || '';
    const originAllowed = allowedOrigins.has(origin) || origin === url.origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
    const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (originAllowed) headers['Access-Control-Allow-Origin'] = origin;
    const json = (value: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(value, { status, headers: { ...headers, ...extra } });
    try {
      if (!/^\/api\/(branches|loans(?:\/[^/]+)?|admin\/session|linkage\/loans(?:\/[^/]+)?)$/.test(path)) throw new AppError('Not found.', 404);
      if (request.method === 'OPTIONS') {
        if (!originAllowed) throw new AppError('Request origin is not allowed.', 403);
        return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-region', 'Access-Control-Max-Age': '600' } });
      }
      if (!keys.some(key => key && key === request.headers.get('apikey'))) throw new AppError('An application API key is required.', 401);
      const methods = path.startsWith('/api/linkage/') ? ['GET','POST','PATCH'] : path === '/api/admin/session' ? ['GET', 'POST', 'DELETE'] : path === '/api/branches' ? ['GET', 'PATCH'] : path === '/api/loans' ? ['GET', 'POST'] : ['GET', 'PATCH', 'DELETE'];
      if (!methods.includes(request.method)) throw new AppError('Method not allowed.', 405);
      if (request.method !== 'GET' && !originAllowed) throw new AppError('Request origin is not allowed.', 403);
      const config = await db.getConfig();
      if (!config.enabled) throw new AppError('The shared workspace is being migrated. Please try again shortly; nothing was changed.', 503);
      if (path.startsWith('/api/linkage/')) {
        if (!config.linkageEnabled) throw new AppError('Shared Agriculture linkage is not enabled yet.', 503);
        const result = await handleLinkage(request, path, db as LinkStorage, request.method === 'GET' ? undefined : await body(request), await isAdmin(request, config.sessionSecret));
        return json(result.data,result.status);
      }
      if (path === '/api/admin/session') {
        if (request.method === 'DELETE') return json({ admin: false }, 200, { 'Set-Cookie': sessionCookie(request, '', true) });
        if (request.method === 'GET') {
          const admin = await isAdmin(request, config.sessionSecret);
          return json({ admin }, 200, admin ? { 'Set-Cookie': sessionCookie(request, await signSession(config.sessionSecret)) } : {});
        }
        if (!config.passwordHash || !config.passwordSalt || !config.sessionSecret) throw new AppError('Admin login has not been configured.', 503);
        const input = await body(request);
        // Gateway-provided IP is useful for an individual limit; a global limit also bounds spoofing/proxy abuse.
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unidentified';
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
        const key = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        const count = await db.loginAttempt(key);
        if (count > 5) throw new AppError('Too many login attempts. Try again in 15 minutes.', 429);
        if (!await verifyPassword(input.password, config.passwordSalt, config.passwordHash)) throw new AppError('Incorrect admin password.', 401);
        await db.clearLoginAttempts(key);
        return json({ admin: true }, 200, { 'Set-Cookie': sessionCookie(request, await signSession(config.sessionSecret)) });
      }
      if (path === '/api/branches') {
        if (request.method === 'GET') return json(await db.listBranches());
        if (!await isAdmin(request, config.sessionSecret)) throw new AppError('Admin login is required.', 401);
        const input = await body(request); const name = typeof input.name === 'string' ? input.name.trim() : '';
        version(input.version);
        if (Object.keys(input).some(k => !['id', 'name', 'version'].includes(k)) || !/^branch-(0[1-9]|1[0-3])$/.test(input.id) || !name || name.length > 80) throw new AppError('Enter a valid branch name of 1–80 characters.');
        return json(await db.renameBranch(input.id, name, input.version));
      }
      if (path === '/api/loans') {
        if (request.method === 'GET') {
          const branchId = url.searchParams.get('branchId') || undefined;
          const category = url.searchParams.get('category') || undefined;
          if (category && !['new', 'renewal'].includes(category)) throw new AppError('Choose New or Renewal.');
          return json((await db.listLoans({ branchId, category })).map(publicLoan));
        }
        const input = await body(request);
        if (Object.keys(input).some(k => !['branchId', 'category', 'atsId', 'borrowerName', 'amount','requestId','linkExistingId','nirnayMatchId','allowDistinct'].includes(k))) throw new AppError('Invalid loan fields.');
        if (!['new', 'renewal'].includes(input.category)) throw new AppError('Choose New or Renewal.');
        const branches = await db.listBranches();
        if (!branches.some(b => b.id === input.branchId)) throw new AppError('Choose a valid branch.');
        const validated=validateLoanInput(input);
        if (input.category==='new' && config.linkageEnabled && db.createSharedLoan) {
          const shared = validateSharedCreate({branchId:input.branchId,...validated,requestId:input.requestId||crypto.randomUUID(),...(input.nirnayMatchId?{nirnayMatchId:input.nirnayMatchId}:{}),...(input.linkExistingId?{linkExistingId:input.linkExistingId}:{}),...(input.allowDistinct?{allowDistinct:true}:{})},'agri');
          if(shared.nirnayMatchId&&!await isAdmin(request,config.sessionSecret))throw new AppError('Admin login is required to link an existing Nirnay decision.',401);
          const saved=await db.createSharedLoan(shared,'agri');
          return json(saved,saved.needsConfirmation?409:201);
        }
        return json(publicLoan(await db.createLoan({ branchId: input.branchId, category: input.category, ...validated })), 201);
      }
      const id = decodeURIComponent(path.slice('/api/loans/'.length));
      if (request.method === 'GET') return json(publicLoan(await db.getLoan(id)));
      const input = await body(request); version(input.version);
      const record = await db.getLoan(id);
      if (record.version !== input.version) throw new AppError('This loan was updated by someone else. Refresh and try again.', 409);
      const admin = await isAdmin(request, config.sessionSecret);
      if (request.method === 'DELETE') {
        if (Object.keys(input).some(k => k !== 'version')) throw new AppError('Invalid loan fields.');
        if (record.status === 'sanctioned' && !admin) throw new AppError('Admin login is required to delete a sanctioned loan.', 401);
        await db.deleteLoan(id, input.version, admin);
        return json({ deleted: true, id });
      }
      const { version: expectedVersion, requestId, ...fields } = input;
      if(requestId!==undefined&&(typeof requestId!=='string'||!/^[a-zA-Z0-9:_-]{8,180}$/.test(requestId)))throw new AppError('Invalid save request ID.');
      const adminUpdate = ['remarks','status','returnReason','returnedDate','sanctionDate'].some(key=>key in fields);
      if (adminUpdate && !admin) throw new AppError('Admin login is required.', 401);
      const changes = admin && adminUpdate ? adminChanges(fields) : publicChanges(record, fields);
      validateDecision(record,changes);
      if ((changes.status ?? record.status) === 'sanctioned') { changes.remarks = ''; changes.compliance = 'none'; }
      if (record.shareEligible && (changes.status ?? record.status)==='sanctioned') changes.remarks = typeof fields.remarks==='string'?fields.remarks.trim():record.remarks;
      else if (record.status === 'sanctioned' && changes.status === 'pending') { changes.remarks ??= ''; changes.compliance = changes.remarks ? 'awaiting' : 'none'; }
      else if ('remarks' in changes && changes.remarks !== record.remarks) changes.compliance = changes.remarks ? 'awaiting' : 'none';
      if((changes.status??record.status)==='returned')changes.compliance='none';
      return json(publicLoan(await db.updateLoan(id, expectedVersion, {...changes,requestId:requestId||crypto.randomUUID()}, admin && adminUpdate ? 'admin' : 'branch')));
    } catch (error) {
      if (error instanceof AppError) return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError || error instanceof URIError) return json({ error: 'Invalid request data.' }, 400);
      console.error('AMCC API failed', error instanceof Error ? error.message : 'Unknown error');
      return json({ error: 'Unable to save or load data. Please try again.' }, 500);
    }
  };
}
