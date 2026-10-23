'use client';
import { useState } from 'react';
import { Building2, ChevronDown, RefreshCcw, Sprout, Trash2 } from 'lucide-react';
import type { Branch, Loan } from '../../lib/types';
import { atsDigits, dateLabel, request, rupees } from '../../lib/types';
import Modal from './Modal';
export default function LoanForm({ branches, branchId, category, loan, admin, onClose, onSaved, onDeleted }: { branches: Branch[]; branchId: string; category: 'new' | 'renewal'; loan?: Loan; admin: boolean; onClose: () => void; onSaved: (saved: Loan) => void; onDeleted: (id: string) => void }) {
  const [ats, setAts] = useState(atsDigits(loan?.atsId ?? '')); const atsId = `ATS ${ats}`; const [amount, setAmount] = useState(loan ? String(loan.amountPaise / 100) : '');
  const [borrowerName, setBorrowerName] = useState(loan?.borrowerName ?? '');
  const [branch, setBranch] = useState(loan?.branchId ?? branchId); const [remarks, setRemarks] = useState(loan?.remarks ?? ''); const [status, setStatus] = useState(loan?.status ?? 'pending');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [baseVersion, setBaseVersion] = useState(loan?.version ?? 0); const [conflict, setConflict] = useState(false); const [latest, setLatest] = useState<Loan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [requestId]=useState(()=>crypto.randomUUID());
  const [candidates,setCandidates]=useState<Loan[]>([]);
  const [linkExistingId,setLinkExistingId]=useState('');
  const [nirnayMatchId,setNirnayMatchId]=useState('');
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [returnReason,setReturnReason]=useState(loan?.returnReason||'');
  const [returnedDate,setReturnedDate]=useState(loan?.returnedDate||today());
  const [allowDistinct,setAllowDistinct]=useState(false);
  const reviewing = admin && !!loan;
  // Sanctioning a new loan asks for the sanctioned amount, which replaces the amount the branch entered.
  const askSanctioned = reviewing && loan.category === 'new' && loan.status === 'pending' && status === 'sanctioned';
  const [sanctionedAmount, setSanctionedAmount] = useState(loan ? String(loan.amountPaise / 100) : '');
  const tone = loan?.category ?? category;
  const kind = tone === 'new' ? 'New loan' : 'Renewal loan';
  const icon = tone === 'new' ? <Sprout size={20}/> : <RefreshCcw size={19}/>;
  // An existing loan is headed by its ATS number, with the branch and added date below.
  const head = loan ? { tone, icon, title: <span className="modal-ats"><span className="modal-ats-tag">ATS</span>{atsDigits(loan.atsId) || 'pending'}</span>, subtitle: `${loan.branchName} · Added ${dateLabel(loan.createdAt)}` } : { tone, icon, title: kind };
  const readOnly = !!loan && !admin && loan.status !== 'pending';
  async function remove() {
    setError(''); setSaving(true);
    try { await request(`/api/loans/${loan!.id}`, { method: 'DELETE', body: JSON.stringify({ version: baseVersion }) }); onDeleted(loan!.id); }
    catch(e) { const message = (e as Error).message; setError(/method not allowed/i.test(message) ? 'The shared loan service doesn’t allow deleting applications yet, so nothing was removed.' : message); setConfirmDelete(false); if ((e as Error).message.includes('updated by someone else')) setConflict(true); } finally { setSaving(false); }
  }
  async function reloadVersion() {
    setSaving(true);
    try { const current = await request<Loan>(`/api/loans/${loan!.id}`); setLatest(current); setBaseVersion(current.version); setConflict(false); setError(''); }
    catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  // The shared service takes amount changes only as a branch-style edit, separate from the admin status update.
  // Save the sanctioned amount first while the loan is still pending, then sanction it.
  async function saveSanctionedAmount() {
    const paise = Math.round(Number(sanctionedAmount) * 100);
    const current = await request<Loan>(`/api/loans/${loan!.id}`, { method: 'PATCH', body: JSON.stringify({ version: baseVersion, atsId: loan!.atsId, ...(loan!.borrowerName ? { borrowerName: loan!.borrowerName } : {}), amount: sanctionedAmount }) });
    setBaseVersion(current.version);
    if (current.amountPaise !== paise) throw new Error(`The shared loan service kept the amount at ${rupees(current.amountPaise)}, so the loan was not sanctioned.`);
    return current.version;
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      if (!reviewing && !borrowerName.trim()) throw new Error('Enter the borrower name.');
      const version = askSanctioned ? await saveSanctionedAmount() : baseVersion;
      const payload = loan ? (reviewing ? { version, remarks: status === 'sanctioned' && !loan.shareEligible ? '' : remarks, status,...(status==='returned'?{returnReason:returnReason.trim(),returnedDate}:{}),...(status==='sanctioned'&&loan.status!=='sanctioned'?{sanctionDate:today()}:{}) } : { version, atsId, borrowerName: borrowerName.trim(), amount }) : { branchId: branch, category, atsId, borrowerName: borrowerName.trim(), amount,requestId,...(nirnayMatchId?{nirnayMatchId}:{}),...(linkExistingId?{linkExistingId}:{}),...(allowDistinct?{allowDistinct:true}:{}) };
      const saved = await request<Loan>(loan ? `/api/loans/${loan.id}` : '/api/loans', { method: loan ? 'PATCH' : 'POST', body: JSON.stringify(loan?{...payload,requestId}:payload) });
      onSaved(saved);
    } catch(e) { const failure=e as Error & {candidates?:Loan[]};setError(failure.message);if(failure.candidates){setCandidates(failure.candidates);setAllowDistinct(false);setLinkExistingId('');} if (failure.message.includes('updated by someone else')) setConflict(true); } finally { setSaving(false); }
  }
  if (readOnly) return <Modal {...head} eyebrow={`Loan details · ${kind}`} onClose={onClose}>
    <div className="review-summary"><span>Loan amount</span><strong>{rupees(loan.amountPaise)}</strong><span>{loan.category === 'new' ? 'New loan' : 'Renewal'} · {loan.status==='returned'?'Returned':'Sanctioned'}</span>{loan.borrowerName ? <span>Borrower: {loan.borrowerName}</span> : null}</div>
    {loan.status==='returned'?<div className="review-summary"><strong>Returned</strong><p>{loan.returnReason||loan.remarks}</p><small>{loan.returnedDate}</small></div>:null}
    {loan.shareEligible ? <RemarkHistory loan={loan}/> : null}
    <div className="modal-actions"><button type="button" className="button primary" onClick={onClose}>Close</button></div>
  </Modal>;
  return <Modal {...head} eyebrow={`${reviewing ? 'Admin review' : loan ? 'Edit application' : 'Add application'}${loan ? ` · ${kind}` : ''}`} onClose={saving ? undefined : onClose}>
    <form onSubmit={save} className="form-stack">
      {reviewing ? <div className="review-top"><div className="review-summary review-borrower-card">{loan.borrowerName ? <strong className="review-borrower" title={loan.borrowerName}>{loan.borrowerName}</strong> : null}<span className="review-amount">{rupees(loan.amountPaise)}</span></div><label className={`review-status ${status}`}><span>Status</span><select aria-label="Status" value={status} onChange={e => {const next=e.target.value as Loan['status'];setStatus(next);if(next==='returned'&&loan.status!=='returned')setReturnedDate(today());}}><option value="pending">Pending</option><option value="sanctioned">Sanctioned</option>{loan.category==='new'?<option value="returned">Returned</option>:null}</select><ChevronDown size={18} aria-hidden="true"/></label></div> : <>
        {admin && !loan ? <label>Branch<select value={branch} onChange={e => setBranch(e.target.value)} required><option value="">Select branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label> : <div className="form-field"><span className="form-field-label">Branch</span><div className="field-static"><Building2 size={15}/>{branches.find(b => b.id === branch)?.name || loan?.branchName || 'No branch selected'}</div></div>}
        <div className="form-row">
          <label>ATS number<span className="ats-input"><span className="ats-prefix" aria-hidden="true">ATS</span><input value={ats} onChange={e => setAts(atsDigits(e.target.value).slice(0, 9))} inputMode="numeric" pattern="[0-9]{8,9}" placeholder="8–9 digits" title="Enter the 8 or 9 digit ATS number" aria-label="ATS number, 8 or 9 digits" required autoFocus/></span></label>
          <label>Amount (₹)<input value={amount} onChange={e => setAmount(e.target.value)} type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" title="Amount in rupees, with up to two decimal places" placeholder="e.g. 250000" required/></label>
        </div>
        <label>Borrower name<input value={borrowerName} onChange={e => setBorrowerName(e.target.value)} type="text" autoComplete="off" autoCapitalize="words" maxLength={120} placeholder="Full name of the borrower" required/></label>
      </>}
      {reviewing&&status==='returned'?<><label>Return reason<textarea value={returnReason} onChange={e=>setReturnReason(e.target.value)} maxLength={2000} required rows={3}/></label><label>Return date<input type="date" value={returnedDate} onChange={e=>setReturnedDate(e.target.value)} required/></label><small>Returning shares this decision with Nirnay. An admin can move the application back to Pending after resubmission.</small></>:null}
      {reviewing && loan.shareEligible && status==='sanctioned' ? <label>Shared remarks<textarea rows={3} value={remarks} onChange={e=>setRemarks(e.target.value)} maxLength={2000}/></label> : null}
      {loan?.shareEligible ? <RemarkHistory loan={loan}/> : null}
      {candidates.length ? <div className="review-summary" role="group" aria-label="Possible existing applications"><strong>Possible existing application</strong>{candidates.map(candidate=><button type="button" className="button secondary" key={candidate.id} onClick={()=>{if(candidate.id.startsWith('nirnay:')){setNirnayMatchId(candidate.id.slice(7));setLinkExistingId('');}else setLinkExistingId(candidate.id);setAllowDistinct(false);setError('Existing application selected. Save to link it.');}}>{candidate.borrowerName} · {candidate.atsId||'ATS pending'} · {rupees(candidate.amountPaise)} · {candidate.status}{linkExistingId===candidate.id?' · Selected':''}</button>)}<button type="button" className="text-button" onClick={()=>{setAllowDistinct(true);setLinkExistingId('');setNirnayMatchId('');setError('Different application confirmed. Save to add it.');}}>This is a different application{allowDistinct?' · Confirmed':''}</button></div> : null}
      {reviewing ? <>{status !== 'sanctioned' ? <><label>Admin remarks<textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} placeholder="Enter any documents or actions required from the branch…"/></label></> : <>{askSanctioned ? <label>Sanctioned amount (₹)<input value={sanctionedAmount} onChange={e => setSanctionedAmount(e.target.value)} type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" title="Amount in rupees, with up to two decimal places" placeholder="e.g. 250000" required autoFocus/></label> : null}<small>{askSanctioned ? `Replaces the ${rupees(loan.amountPaise)} entered by the branch. ` : ''}{loan.shareEligible ? 'Sanctioning closes the compliance request and retains shared remarks.' : 'Sanctioning clears admin remarks and compliance.'}</small></>}</> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {conflict ? <button type="button" className="button secondary" onClick={reloadVersion} disabled={saving}>Load latest version, keep my draft</button> : null}
      {latest ? <div className="review-summary"><span>Latest saved version · {latest.atsId} · {rupees(latest.amountPaise)} · {latest.status}</span>{latest.borrowerName ? <span>Borrower: {latest.borrowerName}</span> : null}<span>Current remarks: {latest.remarks || 'None'}</span><small>Your draft is preserved above. Review it before saving over the latest version.</small></div> : null}
      {loan && confirmDelete ? <div className="delete-confirm" role="alert"><p>{loan.shareEligible?'Archive':'Delete'} <strong>{loan.atsId||loan.borrowerName}</strong>? {loan.shareEligible?'This hides it from Agri while retaining its shared record and remarks in Nirnay.':'This removes the application for everyone and can’t be undone.'}</p><div><button type="button" className="button secondary" onClick={() => setConfirmDelete(false)} disabled={saving}>Keep it</button><button type="button" className="button danger" onClick={remove} disabled={saving}>{saving ? 'Saving…' : loan.shareEligible?'Yes, archive':'Yes, delete'}</button></div></div> : null}
      <div className="modal-actions">{loan && !confirmDelete ? <button type="button" className="button delete-button" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 size={15}/> Delete</button> : null}<button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : reviewing ? 'Save review' : loan ? 'Save changes' : 'Add loan'}</button></div>
    </form>
  </Modal>;
}
function RemarkHistory({loan}:{loan:Loan}) {
 return <div className="review-summary"><strong>Shared status history</strong>{loan.statusHistory?.length?loan.statusHistory.map(event=><div key={event.id}><p>{event.fromStatus} → {event.toStatus}{event.reason?' · '+event.reason:''}</p><small>{event.sourceApp==='nirnay'?'Nirnay':'Agri'} · {dateLabel(event.createdAt)}</small></div>):<span>No status changes recorded yet.</span>}<strong>Shared remarks history</strong>{loan.remarkHistory?.length ? loan.remarkHistory.map(note=><div key={note.id}><p>{note.body||'Remark cleared'}</p><small>{note.sourceApp==='nirnay'?'Nirnay':'Agri'} · {note.author} · {dateLabel(note.createdAt)}</small></div>) : <span>No shared remarks yet.</span>}</div>;
}
