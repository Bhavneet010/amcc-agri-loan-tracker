import { AppError,validateDecision } from './validation.ts';
export const normalizeBorrower = (name: string) => name.normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
const requestId = (id: unknown) => { if (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{8,180}$/.test(id)) throw new AppError('A stable save request ID is required.'); return id; };
const localFields = new Set(['returnReason','documentationDate','disbursementDate','status','allocatedTo','manualOfficer','manualOfficerMonth','receiveDate','sanctionDate','returnedDate','reminderMails','monthEndCleared','monthEndClearedMonth','monthEndClearedAt','loanType','isTermLoan','isCC','isBre','isFreshCC','manuallyCreated','category','remarks','customerName','branch','amount','acNumber','updatedAt','updatedBy']);
export function validateSharedCreate(input: any, source: 'agri' | 'nirnay') {
  const allowed = ['branchId','borrowerName','amountPaise','atsId','requestId','linkExistingId','nirnayMatchId','allowDistinct','author','remarks','nirnayData'];
  if (!input || Object.keys(input).some(k => !allowed.includes(k))) throw new AppError('Invalid shared application fields.');
  if (!/^branch-(0[1-9]|1[0-3])$/.test(input.branchId)) throw new AppError('Choose a valid branch.');
  const name = typeof input.borrowerName === 'string' ? input.borrowerName.trim() : '';
  if (!name || name.length > 120) throw new AppError('Enter a borrower name of 1–120 characters.');
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) throw new AppError('Enter a valid positive amount.');
  const ats = typeof input.atsId === 'string' ? input.atsId.trim() : null;
  if ((source === 'agri' && !ats) || (ats && ats.length > 80)) throw new AppError('Enter a valid ATS number.');
  if (input.allowDistinct !== undefined && typeof input.allowDistinct !== 'boolean') throw new AppError('Confirm whether this is a different application.');
  if (input.linkExistingId !== undefined && (typeof input.linkExistingId !== 'string' || input.linkExistingId.length > 100)) throw new AppError('Invalid existing application.');
  if (input.remarks !== undefined && (typeof input.remarks !== 'string' || input.remarks.length > 2000)) throw new AppError('Remarks must be at most 2,000 characters.');
  if(input.nirnayMatchId!==undefined&&(typeof input.nirnayMatchId!=='string'||!/^[-a-zA-Z0-9_]{1,160}$/.test(input.nirnayMatchId)))throw new AppError('Invalid Nirnay match.');
  const nirnayData = input.nirnayData || {};
  validateLocalData(nirnayData);
  if(nirnayData.isFreshCC===false)throw new AppError('Only fresh Agriculture applications can be shared.');
  return { ...input, branchId: input.branchId, borrowerName: name, amountPaise: input.amountPaise, atsId: ats || null, requestId: requestId(input.requestId), author: typeof input.author === 'string' ? input.author.trim().slice(0,80) : source === 'agri' ? 'Agri branch' : 'Nirnay user', nirnayData };
}
function validateLocalData(data: any) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !localFields.has(k))) throw new AppError('Invalid Nirnay workflow fields.');
  if (data.category !== undefined && data.category !== 'Agriculture') throw new AppError('Shared applications must remain Agriculture.');
  if (data.status !== undefined && !['pending','sanctioned','returned'].includes(data.status)) throw new AppError('Invalid Nirnay status.');
  if (data.remarks !== undefined && (typeof data.remarks !== 'string' || data.remarks.length > 2000)) throw new AppError('Remarks must be at most 2,000 characters.');
  if (data.reminderMails !== undefined && (!Array.isArray(data.reminderMails) || data.reminderMails.length > 100)) throw new AppError('Invalid reminder history.');
}
export function validateNirnayPatch(input: any) {
  if (!input || Object.keys(input).some(k => !['version','nirnayVersion','data','requestId','author','archived'].includes(k))) throw new AppError('Invalid shared update.');
  if (!Number.isSafeInteger(input.version) || input.version < 1 || (input.nirnayVersion !== undefined && (!Number.isSafeInteger(input.nirnayVersion) || input.nirnayVersion < 0))) throw new AppError('A current record version is required.');
  validateLocalData(input.data || {});
  if (input.archived !== undefined && typeof input.archived !== 'boolean') throw new AppError('Invalid archive choice.');
  return { ...input, data: input.data || {}, requestId: requestId(input.requestId), nirnayVersion: input.nirnayVersion ?? 0, author: typeof input.author === 'string' ? input.author.trim().slice(0,80) : 'Nirnay user' };
}
export interface LinkStorage {
  listSharedLoans(): Promise<any[]>;
  getSharedLoan(id: string): Promise<any>;
  createSharedLoan(input: any, source: string): Promise<any>;
  updateNirnay(id: string, input: any): Promise<any>;
}
export async function handleLinkage(request: Request, path: string, db: LinkStorage, input: any, admin: boolean) {
  if (path === '/api/linkage/loans') {
    if (request.method === 'GET') return { data: await db.listSharedLoans(), status: 200 };
    if (request.method !== 'POST') throw new AppError('Method not allowed.', 405);
    const data = validateSharedCreate(input, 'nirnay');
    if(data.nirnayMatchId&&!admin)throw new AppError('Admin login is required to link an existing Nirnay decision.',401);
    const saved = await db.createSharedLoan(data, 'nirnay');
    return { data: saved, status: saved.needsConfirmation ? 409 : 200 };
  }
  if (request.method !== 'PATCH') throw new AppError('Method not allowed.', 405);
  const id = decodeURIComponent(path.slice('/api/linkage/loans/'.length));
  const patch = validateNirnayPatch(input);
  const current = await db.getSharedLoan(id);
  if (patch.archived !== undefined && current.status === 'sanctioned' && !admin) throw new AppError('Admin login is required to delete or restore a sanctioned loan.',401);
  const decisionChanged=['status','returnReason','returnedDate','sanctionDate'].some(key=>key in patch.data&&patch.data[key]!==''&&patch.data[key]!==current[key]);
  if(decisionChanged&&!admin)throw new AppError('Admin login is required to change a shared decision.',401);
  // Old inline editors include empty dates while pending; those do not clear decision history.
  for(const key of ['returnedDate','sanctionDate'])if(patch.data[key]==='')delete patch.data[key];
  validateDecision({...current,category:'new'},patch.data);
  return { data: await db.updateNirnay(id, patch), status: 200 };
}
