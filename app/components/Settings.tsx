'use client';
import { useState } from 'react';
import { Check, Building2 } from 'lucide-react';
import type { Branch } from '../../lib/types';
import { request } from '../../lib/types';
import Modal from './Modal';
export default function Settings({ branches, selected, admin, initial, onSelect, onClose, onRenamed, onAdmin }: { branches: Branch[]; selected: string; admin: boolean; initial?: boolean; onSelect: (id: string) => void; onClose?: () => void; onRenamed: (branches: Branch[]) => void; onAdmin: () => void }) {
  const [renameId, setRenameId] = useState(selected || branches[0]?.id || ''); const [name, setName] = useState(branches.find(b => b.id === renameId)?.name || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function rename(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { onRenamed(await request<Branch[]>('/api/branches', { method: 'PATCH', body: JSON.stringify({ id: renameId, name, version: branches.find(b => b.id === renameId)?.version }) })); } catch(e) { setError((e as Error).message); try { onRenamed(await request<Branch[]>('/api/branches')); } catch {} } finally { setBusy(false); } }
  return <Modal title={initial ? 'Welcome to your loan workspace' : 'Branch settings'} subtitle={initial ? 'Select your branch to get started. We’ll remember it on this device.' : 'Choose the branch you want to work with.'} onClose={busy ? undefined : onClose}>
    <div className="branch-grid">{branches.map((b, i) => <button key={b.id} className={`branch-option ${selected === b.id ? 'selected' : ''}`} onClick={() => onSelect(b.id)}><span className="branch-number">{String(i + 1).padStart(2, '0')}</span><span>{b.name}</span>{selected === b.id ? <Check size={16}/> : null}</button>)}</div>
    <p className="settings-note"><Building2 size={15}/> You can switch branches anytime in Settings.</p>
    {admin ? <form onSubmit={rename} className="rename-form"><h3>Manage branch names</h3><label>Branch<select value={renameId} onChange={e => { setRenameId(e.target.value); setName(branches.find(b => b.id === e.target.value)!.name); }}>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label>Display name<input value={name} onChange={e => setName(e.target.value)} required maxLength={80}/></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save branch name'}</button></form> : null}
    {initial ? <div className="onboarding-footer"><span>Working at the loan cell?</span><button className="text-button" onClick={onAdmin}>Admin access →</button></div> : null}
  </Modal>;
}
