'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building2, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Download, Layers2, Leaf, LogOut, RefreshCw, Search, Settings as Gear, ShieldCheck, WifiOff } from 'lucide-react';
import type { Branch, Loan } from '../../lib/types';
import { request } from '../../lib/types';
import LoanTable from './LoanTable';
import LoanForm from './LoanForm';
import Settings from './Settings';
import AdminLogin from './AdminLogin';
import Modal from './Modal';
import { showInstallEvent } from './InstallPrompt';

const preferenceKey = 'amcc.branch.v1';
const recentCount = 5;
const NewLoanIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8l5 5v5"/><path d="M14 3v5h5"/><path d="M8 11h4M8 14h6M8 17h3"/><path d="M18 16v6M15 19h6"/></svg>;
export default function Workspace() {
  const [branches, setBranches] = useState<Branch[]>([]); const [branchId, setBranch] = useState('');
  const [admin, setAdmin] = useState(false); const [viewAdmin, setViewAdmin] = useState(false); const [adminFilter, setAdminFilter] = useState('');
  const [category, setCategory] = useState<'new' | 'renewal'>('new'); const [loans, setLoans] = useState<Loan[]>([]);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [compliance, setCompliance] = useState('');
  const [loading, setLoading] = useState(true); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false); const [login, setLogin] = useState(false); const [form, setForm] = useState<Loan | 'new' | null>(null);
  const [busy, setBusy] = useState(''); const [online, setOnline] = useState(true); const [help, setHelp] = useState(false); const [menu, setMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); const [showAll, setShowAll] = useState(false);
  const activeAdmin = admin && viewAdmin;
  const filterBranch = activeAdmin ? adminFilter : branchId;
  const selected = branches.find(b => b.id === branchId);
  const refresh = useCallback(() => setRefreshKey(key => key + 1), []);

  useEffect(() => {
    let alive = true;
    Promise.all([request<Branch[]>('/api/branches'), request<{ admin: boolean }>('/api/admin/session')]).then(([list, session]) => {
      if (!alive) return;
      setBranches(list); setAdmin(session.admin);
      let stored = ''; try { stored = localStorage.getItem(preferenceKey) || ''; } catch {}
      if (list.some(b => b.id === stored)) setBranch(stored);
      setReady(true); setLoading(false);
    }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready || (!activeAdmin && !branchId)) return;
    let alive = true;
    setLoading(true); setLoans([]); setError('');
    async function load() {
      try {
        const rows = await request<Loan[]>('/api/loans' + (filterBranch ? `?branchId=${encodeURIComponent(filterBranch)}` : ''));
        if (alive) { setLoans(rows); setError(''); }
      } catch(e) { if (alive) setError((e as Error).message); }
      finally { if (alive) setLoading(false); }
    }
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 20000);
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [ready, branchId, activeAdmin, filterBranch, refreshKey]);

  useEffect(() => {
    const check = () => { setOnline(navigator.onLine); if (navigator.onLine) refresh(); };
    setOnline(navigator.onLine); window.addEventListener('online', check); window.addEventListener('offline', check);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { window.removeEventListener('online', check); window.removeEventListener('offline', check); };
  }, [refresh]);
  useEffect(() => { if (!menu) return; const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [menu]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  function chooseBranch(id: string) { setBranch(id); setSettings(false); if (activeAdmin) setAdminFilter(id); try { localStorage.setItem(preferenceKey, id); } catch {} setSearch(''); setStatus(''); }
  async function complianceUpdate(loan: Loan) {
    setBusy(loan.id); setError('');
    try { await request(`/api/loans/${loan.id}`, { method: 'PATCH', body: JSON.stringify({ version: loan.version, compliance: loan.compliance === 'complied' ? 'awaiting' : 'complied' }) }); setNotice(loan.compliance === 'complied' ? 'Compliance reopened.' : 'Marked as complied.'); refresh(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function logout() {
    try { await request('/api/admin/session', { method: 'DELETE' }); setAdmin(false); setViewAdmin(false); setNotice('Signed out of admin.'); }
    catch(e) { setError((e as Error).message); }
  }
  function install() { setHelp(false); window.dispatchEvent(new Event(showInstallEvent)); }
  const canAdd = ready && (activeAdmin || !!branchId);
  function create(kind: 'new' | 'renewal') { setCategory(kind); setForm('new'); }
  const tabLoans = loans.filter(loan => loan.category === category);
  const filtered = !!(search || status || compliance);
  const visibleLoans = useMemo(() => tabLoans.filter(loan => loan.atsId.toLowerCase().includes(search.toLowerCase()) && (!status || loan.status === status) && (!compliance || loan.compliance === compliance)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [loans, category, search, status, compliance]);
  const shownLoans = showAll || filtered ? visibleLoans : visibleLoans.slice(0, recentCount);
  const pendingLoans = loans.filter(l => l.status === 'pending'); const sanctionedLoans = loans.filter(l => l.status === 'sanctioned');
  const awaiting = loans.filter(l => l.compliance === 'awaiting');
  return <div className="app-shell">
    <header className="appbar">
      <a className="brand" href="/" aria-label="AMCC loan tracker home"><span className="brand-icon"><Leaf size={23}/></span><span>AMCC<span className="brand-sub">AGRI LOAN CELL</span></span></a>
      <div className="appbar-actions">{activeAdmin ? <span className="admin-label"><ShieldCheck size={14}/> Admin</span> : null}<button className="branch-switch" onClick={() => setSettings(true)}><span>{selected?.name || 'Select branch'}</span><ChevronDown size={14}/></button><button className={`icon-button menu-button ${menu ? 'open' : ''}`} onClick={() => setMenu(!menu)} aria-label="Settings" aria-expanded={menu} aria-haspopup="menu"><Gear size={20}/></button>
        {menu ? <><div className="menu-backdrop" onClick={() => setMenu(false)}/><div className="app-menu" role="menu" onClick={() => setMenu(false)}>
          {activeAdmin ? <div className="menu-label"><ShieldCheck size={13}/> Admin view</div> : null}
          <button role="menuitem" className={!activeAdmin ? 'current' : ''} onClick={() => setViewAdmin(false)}><Layers2 size={17}/> Branch loans</button>
          {admin ? <button role="menuitem" className={activeAdmin ? 'current' : ''} onClick={() => setViewAdmin(true)}><ShieldCheck size={17}/> Admin overview</button> : null}
          <button role="menuitem" onClick={() => setSettings(true)}><Building2 size={17}/> Change branch</button>
          <div className="menu-divider"/>
          <button role="menuitem" onClick={install}><Download size={17}/> Install app</button>
          <button role="menuitem" onClick={() => setHelp(true)}><CircleHelp size={17}/> Help</button>
          {admin ? <button role="menuitem" onClick={logout}><LogOut size={17}/> Sign out of admin</button> : <button role="menuitem" onClick={() => setLogin(true)}><ShieldCheck size={17}/> Admin access</button>}
          <div className="menu-status"><span className={`connection-dot ${!online ? 'offline' : ''}`}/>{online ? 'Shared workspace' : 'Offline'}</div>
        </div></> : null}
      </div>
    </header>
      <main>
        {!online ? <div className="message warning" role="status"><WifiOff size={17}/> You’re offline. Reconnect to load or save loans. Unsaved form details stay here.</div> : null}
        {error ? <div className="message error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { if (!ready) window.location.reload(); else refresh(); }}>Try again</button></div> : null}
        <section className="hero" aria-label="Loan summary">
          <div className="hero-total"><strong>{loading ? '—' : loans.length}</strong><span className="hero-rule"/><span className="hero-label">Applications</span></div>
          <dl className="hero-stats">
            <div><dt><span className="dot pending"/>Pending</dt><dd>{loading ? '—' : pendingLoans.length}</dd></div>
            <div><dt><span className="dot sanctioned"/>Sanctioned</dt><dd>{loading ? '—' : sanctionedLoans.length}</dd></div>
            <div><dt><span className="dot action"/>Action required</dt><dd>{loading ? '—' : awaiting.length}</dd></div>
          </dl>
        </section>
        <section className="create-band" aria-labelledby="create-heading"><div className="create-inner">
          <h2 id="create-heading" className="create-heading">Create application</h2>
          <div className="create-actions">
            <button className="create-action" onClick={() => create('new')} disabled={!canAdd}><span className="create-icon"><NewLoanIcon/></span><span className="create-text"><strong>New loan</strong><span>Submit a new loan</span></span><ArrowRight size={21} strokeWidth={1.5}/></button>
            <button className="create-action" onClick={() => create('renewal')} disabled={!canAdd}><span className="create-icon"><RefreshCw size={24} strokeWidth={1.75}/></span><span className="create-text"><strong>Renewal</strong><span>Submit a renewal</span></span><ArrowRight size={21} strokeWidth={1.5}/></button>
          </div>
        </div></section>
        <section className="recent" aria-labelledby="recent-heading">
          <div className="recent-head"><h2 id="recent-heading">Recent applications</h2><button className="view-all" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? 'Show recent' : 'View all'}<ChevronRight size={17} className={showAll ? 'flip' : ''}/></button></div>
          <div className="tabs" role="tablist" aria-label="Loan category"><button role="tab" aria-selected={category === 'new'} aria-controls="loans-panel" id="new-tab" className={category === 'new' ? 'selected' : ''} onClick={() => setCategory('new')}>New loans <span>{loading ? 0 : loans.filter(l => l.category === 'new').length}</span></button><span className="tab-divider" aria-hidden="true"/><button role="tab" aria-selected={category === 'renewal'} aria-controls="loans-panel" id="renewal-tab" className={category === 'renewal' ? 'selected' : ''} onClick={() => setCategory('renewal')}>Renewals <span>{loading ? 0 : loans.filter(l => l.category === 'renewal').length}</span></button></div>
          <div className="table-toolbar"><label className="search-field"><Search size={21} strokeWidth={1.75}/><input aria-label="Search ATS number" placeholder="Search ATS number…" value={search} onChange={e => setSearch(e.target.value)}/></label>{activeAdmin ? <select aria-label="Filter branch" value={adminFilter} onChange={e => setAdminFilter(e.target.value)}><option value="">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select> : null}<span className="select-field"><select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="sanctioned">Sanctioned</option></select><ChevronDown size={18}/></span>{activeAdmin ? <select aria-label="Filter compliance" value={compliance} onChange={e => setCompliance(e.target.value)}><option value="">All compliance</option><option value="awaiting">Awaiting</option><option value="complied">Complied</option><option value="none">No remarks</option></select> : null}</div>
          <div id="loans-panel" role="tabpanel" aria-labelledby={category === 'new' ? 'new-tab' : 'renewal-tab'}>{loading ? <div className="loading-state"><RefreshCw size={23} className="spin"/><p>Loading shared applications…</p></div> : <LoanTable loans={shownLoans} admin={activeAdmin} onEdit={setForm} onCompliance={complianceUpdate} busy={busy} filtered={filtered}/>}</div>
          {!loading && visibleLoans.length > shownLoans.length ? <button className="show-more" onClick={() => setShowAll(true)}>View all {visibleLoans.length} {category === 'new' ? 'new loans' : 'renewals'}</button> : null}
        </section>
      </main>
    {notice ? <div className="toast" role="status"><CheckCheck size={18}/>{notice}</div> : null}
    {ready && (settings || (!branchId && !activeAdmin)) && !login ? <Settings branches={branches} selected={branchId} admin={activeAdmin} initial={!branchId && !activeAdmin} onSelect={chooseBranch} onClose={branchId || activeAdmin ? () => setSettings(false) : undefined} onRenamed={list => { setBranches(list); setNotice('Branch name updated.'); refresh(); }} onAdmin={() => { setSettings(false); setLogin(true); }}/>: null}
    {login ? <AdminLogin onClose={() => setLogin(false)} onLogin={() => { setLogin(false); setAdmin(true); setViewAdmin(true); setAdminFilter(''); setNotice('Welcome to the admin workspace.'); }}/>: null}
    {form ? <LoanForm key={form === 'new' ? 'new' : form.id} branches={branches} branchId={activeAdmin ? adminFilter || branchId : branchId} category={category} loan={form === 'new' ? undefined : form} admin={activeAdmin} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNotice('Loan saved to the shared workspace.'); refresh(); }}/>: null}
    {help ? <Modal title="Your workspace, anywhere" subtitle="AMCC loan sourcing & renewals" onClose={() => setHelp(false)}><div className="help-content"><h3>Working with loans</h3><p>Select a branch, choose New loans or Renewals, and add the ATS number and amount. Read admin remarks and mark them complied with once the action is complete.</p><h3>Switching branches</h3><p>Use Settings or the branch selector at the top. Everyone with this link can switch between all thirteen branches.</p><h3>Install on your device</h3><p>In Chrome or Edge, use the browser’s Install app option. On iPhone or iPad, open in Safari, tap Share, then Add to Home Screen.</p><button type="button" className="button primary" onClick={install}><Download size={15}/> Show install steps</button><h3>Shared updates</h3><p>Loans are stored in a shared database. Keep an internet connection to save changes. The workspace refreshes automatically while open.</p></div></Modal> : null}
  </div>;
}
