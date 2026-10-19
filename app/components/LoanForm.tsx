'use client';
import { useState } from 'react';
import { Building2, ChevronDown, RefreshCcw, Sprout, Trash2 } from 'lucide-react';
import type { Branch, Loan } from '../../lib/types';
import { atsDigits, request, rupees } from '../../lib/types';
import Modal from './Modal';
export default function LoanForm({ branches, branchId, category, loan, admin, onClose, onSaved, onDeleted }: { branches: Branch[]; branchId: string; category: 'new' | 'renewal'; loan?: Loan; admin: boolean; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [ats, setAts] = useState(atsDigits(loan?.atsId ?? '')); const atsId = `ATS ${ats}`; const [amount, setAmount] = useState(loan ? String(loan.amountPaise / 100) : '');
  const [borrowerName, setBorrowerName] = useState(loan?.borrowerName ?? '');
  const [branch, setBranch] = useState(loan?.branchId ?? branchId); const [remarks, setRemarks] = useState(loan?.remarks ?? ''); const [status, setStatus] = useState(loan?.status ?? 'pending');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [baseVersion, setBaseVersion] = useState(loan?.version ?? 0); const [conflict, setConflict] = useState(false); const [latest, setLatest] = useState<Loan | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const reviewing = admin && !!loan;
  const tone = loan?.category ?? category;
  const head = { tone, title: tone === 'new' ? 'New loan' : 'Renewal loan', icon: tone === 'new' ? <Sprout size={20}/> : <RefreshCcw size={19}/> };
  const readOnly = !!loan && !admin && loan.status === 'sanctioned';
  async function remove() {
    setError(''); setSaving(true);
    try { await request(`/api/loans/${loan!.id}`, { method: 'DELETE', body: JSON.stringify({ version: baseVersion }) }); onDeleted(); }
    catch(e) { const message = (e as Error).message; setError(/method not allowed/i.test(message) ? 'The shared loan service doesn’t allow deleting applications yet, so nothing was removed.' : message); setConfirmDelete(false); if ((e as Error).message.includes('updated by someone else')) setConflict(true); } finally { setSaving(false); }
  }
  async function reloadVersion() {
    setSaving(true);
    try { const current = await request<Loan>(`/api/loans/${loan!.id}`); setLatest(current); setBaseVersion(current.version); setConflict(false); setError(''); }
    catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      if (!reviewing && !borrowerName.trim()) throw new Error('Enter the borrower name.');
      const payload = loan ? (reviewing ? { version: baseVersion, remarks: status === 'sanctioned' ? '' : remarks, status } : { version: baseVersion, atsId, borrowerName: borrowerName.trim(), amount }) : { branchId: branch, category, atsId, borrowerName: borrowerName.trim(), amount };
      await request(loan ? `/api/loans/${loan.id}` : '/api/loans', { method: loan ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      onSaved();
    } catch(e) { setError((e as Error).message); if ((e as Error).message.includes('updated by someone else')) setConflict(true); } finally { setSaving(false); }
  }
  if (readOnly) return <Modal {...head} eyebrow="Loan details" subtitle={`${loan.atsId} · ${loan.branchName}`} onClose={onClose}>
    <div className="review-summary"><span>Loan amount</span><strong>{rupees(loan.amountPaise)}</strong><span>{loan.category === 'new' ? 'New loan' : 'Renewal'} · Sanctioned</span>{loan.borrowerName ? <span>Borrower: {loan.borrowerName}</span> : null}</div>
    <div className="modal-actions"><button type="button" className="button primary" onClick={onClose}>Close</button></div>
  </Modal>;
  return <Modal {...head} eyebrow={reviewing ? 'Admin review' : loan ? 'Edit application' : 'Add application'} subtitle={loan ? `${loan.atsId} · ${loan.branchName}` : undefined} onClose={saving ? undefined : onClose}>
    <form onSubmit={save} className="form-stack">
      {reviewing ? <div className="review-top"><div className="review-summary"><span>Loan amount</span><strong>{rupees(loan.amountPaise)}</strong>{loan.borrowerName ? <span className="review-borrower" title={loan.borrowerName}>{loan.borrowerName}</span> : null}</div><label className={`review-status ${status}`}><span>Status</span><select value={status} onChange={e => setStatus(e.target.value as 'pending' | 'sanctioned')}><option value="pending">Pending</option><option value="sanctioned">Sanctioned</option></select><ChevronDown size={18} aria-hidden="true"/></label></div> : <>
        {admin && !loan ? <label>Branch<select value={branch} onChange={e => setBranch(e.target.value)} required><option value="">Select branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label> : <div className="form-field"><span className="form-field-label">Branch</span><div className="field-static"><Building2 size={15}/>{branches.find(b => b.id === branch)?.name || loan?.branchName || 'No branch selected'}</div></div>}
        <div className="form-row">
          <label>ATS number<span className="ats-input"><span className="ats-prefix" aria-hidden="true">ATS</span><input value={ats} onChange={e => setAts(atsDigits(e.target.value).slice(0, 9))} inputMode="numeric" pattern="[0-9]{8,9}" placeholder="8–9 digits" title="Enter the 8 or 9 digit ATS number" aria-label="ATS number, 8 or 9 digits" required autoFocus/></span></label>
          <label>Amount (₹)<input value={amount} onChange={e => setAmount(e.target.value)} type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" title="Amount in rupees, with up to two decimal places" placeholder="e.g. 250000" required/></label>
        </div>
        <label>Borrower name<input value={borrowerName} onChange={e => setBorrowerName(e.target.value)} type="text" autoComplete="off" autoCapitalize="words" maxLength={120} placeholder="Full name of the borrower" required/></label>
      </>}
      {reviewing ? <>{status === 'pending' ? <><label>Admin remarks<textarea rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} placeholder="Enter any documents or actions required from the branch…"/></label><small>Changing remarks resets the branch’s compliance response.</small></> : <small>Sanctioning a loan clears its admin remarks and compliance request.</small>}</> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {conflict ? <button type="button" className="button secondary" onClick={reloadVersion} disabled={saving}>Load latest version, keep my draft</button> : null}
      {latest ? <div className="review-summary"><span>Latest saved version · {latest.atsId} · {rupees(latest.amountPaise)} · {latest.status}</span>{latest.borrowerName ? <span>Borrower: {latest.borrowerName}</span> : null}<span>Current remarks: {latest.remarks || 'None'}</span><small>Your draft is preserved above. Review it before saving over the latest version.</small></div> : null}
      {loan && confirmDelete ? <div className="delete-confirm" role="alert"><p>Delete <strong>{loan.atsId}</strong>? This removes the application for everyone and can’t be undone.</p><div><button type="button" className="button secondary" onClick={() => setConfirmDelete(false)} disabled={saving}>Keep it</button><button type="button" className="button danger" onClick={remove} disabled={saving}>{saving ? 'Deleting…' : 'Yes, delete'}</button></div></div> : null}
      <div className="modal-actions">{loan && !confirmDelete ? <button type="button" className="button delete-button" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 size={15}/> Delete</button> : null}<button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : reviewing ? 'Save review' : loan ? 'Save changes' : 'Add loan'}</button></div>
    </form>
  </Modal>;
}
