'use client';
import { useState } from 'react';
import type { Branch, Loan } from '../../lib/types';
import { request, rupees } from '../../lib/types';
import Modal from './Modal';
export default function LoanForm({ branches, branchId, category, loan, admin, onClose, onSaved }: { branches: Branch[]; branchId: string; category: 'new' | 'renewal'; loan?: Loan; admin: boolean; onClose: () => void; onSaved: () => void }) {
  const [atsId, setAts] = useState(loan?.atsId ?? ''); const [amount, setAmount] = useState(loan ? String(loan.amountPaise / 100) : '');
  const [branch, setBranch] = useState(loan?.branchId ?? branchId); const [remarks, setRemarks] = useState(loan?.remarks ?? ''); const [status, setStatus] = useState(loan?.status ?? 'pending');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [baseVersion, setBaseVersion] = useState(loan?.version ?? 0); const [conflict, setConflict] = useState(false); const [latest, setLatest] = useState<Loan | null>(null);
  const reviewing = admin && !!loan;
  async function reloadVersion() {
    setSaving(true);
    try { const current = await request<Loan>(`/api/loans/${loan!.id}`); setLatest(current); setBaseVersion(current.version); setConflict(false); setError(''); }
    catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      const payload = loan ? (reviewing ? { version: baseVersion, remarks, status } : { version: baseVersion, atsId, amount }) : { branchId: branch, category, atsId, amount };
      await request(loan ? `/api/loans/${loan.id}` : '/api/loans', { method: loan ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      onSaved();
    } catch(e) { setError((e as Error).message); if ((e as Error).message.includes('updated by someone else')) setConflict(true); } finally { setSaving(false); }
  }
  return <Modal title={reviewing ? 'Review loan' : loan ? 'Edit loan' : `Add ${category === 'new' ? 'new' : 'renewal'} loan`} subtitle={reviewing ? `${loan.atsId} · ${loan.branchName}` : 'Enter the application details below.'} onClose={saving ? undefined : onClose}>
    <form onSubmit={save} className="form-stack">
      {reviewing ? <div className="review-summary"><span>Loan amount</span><strong>{rupees(loan.amountPaise)}</strong><span>{loan.category === 'new' ? 'New loan' : 'Renewal'}</span></div> : <>
        <label>Branch<select value={branch} onChange={e => setBranch(e.target.value)} disabled={!!loan} required><option value="">Select branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>ATS / application number<input value={atsId} onChange={e => setAts(e.target.value)} placeholder="e.g. ATS-2026-001" maxLength={80} required autoFocus/></label>
        <label>Loan amount (₹)<input value={amount} onChange={e => setAmount(e.target.value)} type="text" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="e.g. 250000" required/><small>Amount in rupees, with up to two decimal places.</small></label>
      </>}
      {reviewing ? <><label>Admin remarks<textarea rows={4} value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} placeholder="Enter any documents or actions required from the branch…"/></label><small>Changing remarks resets the branch’s compliance response.</small><label>Status<select value={status} onChange={e => setStatus(e.target.value as 'pending' | 'sanctioned')}><option value="pending">Pending</option><option value="sanctioned">Sanctioned</option></select></label></> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {conflict ? <button type="button" className="button secondary" onClick={reloadVersion} disabled={saving}>Load latest version, keep my draft</button> : null}
      {latest ? <div className="review-summary"><span>Latest saved version · {latest.atsId} · {rupees(latest.amountPaise)} · {latest.status}</span><span>Current remarks: {latest.remarks || 'None'}</span><small>Your draft is preserved above. Review it before saving over the latest version.</small></div> : null}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving…' : reviewing ? 'Save review' : loan ? 'Save changes' : 'Add loan'}</button></div>
    </form>
  </Modal>;
}
