'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Building2, CheckCheck, ChevronDown, CircleHelp, Download, FilePlus2, Layers2, Leaf, LogOut, Plus, RefreshCw, Search, Settings2, ShieldCheck, WifiOff } from 'lucide-react';
import type { Branch, Loan } from '../../lib/types';
import { request, rupees } from '../../lib/types';
import LoanTable from './LoanTable';
import LoanForm from './LoanForm';
import Settings from './Settings';
import AdminLogin from './AdminLogin';
import Modal from './Modal';
import { showInstallEvent } from './InstallPrompt';

const preferenceKey = 'amcc.branch.v1';
export default function Workspace() {
  const [branches, setBranches] = useState<Branch[]>([]); const [branchId, setBranch] = useState('');
  const [admin, setAdmin] = useState(false); const [viewAdmin, setViewAdmin] = useState(false); const [adminFilter, setAdminFilter] = useState('');
  const [category, setCategory] = useState<'new' | 'renewal'>('new'); const [loans, setLoans] = useState<Loan[]>([]);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState(''); const [compliance, setCompliance] = useState('');
  const [loading, setLoading] = useState(true); const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false); const [login, setLogin] = useState(false); const [form, setForm] = useState<Loan | 'new' | null>(null);
  const [busy, setBusy] = useState(''); const [online, setOnline] = useState(true); const [help, setHelp] = useState(false);
  const [updated, setUpdated] = useState(''); const [refreshKey, setRefreshKey] = useState(0);
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
        if (alive) { setLoans(rows); setError(''); setUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })); }
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
  const tabLoans = loans.filter(loan => loan.category === category);
  const visibleLoans = useMemo(() => tabLoans.filter(loan => loan.atsId.toLowerCase().includes(search.toLowerCase()) && (!status || loan.status === status) && (!compliance || loan.compliance === compliance)), [loans, category, search, status, compliance]);
  const pendingLoans = tabLoans.filter(l => l.status === 'pending'); const sanctionedLoans = tabLoans.filter(l => l.status === 'sanctioned');
  const awaiting = tabLoans.filter(l => l.compliance === 'awaiting'); const sum = (rows: Loan[]) => rows.reduce((total, row) => total + row.amountPaise, 0);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="AMCC loan tracker home"><span className="brand-icon"><Leaf size={23}/></span><span>AMCC<span className="brand-sub">AGRI LOAN CELL</span></span></a>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav aria-label="Workspace navigation"><button className={`nav-item ${!activeAdmin ? 'active' : ''}`} onClick={() => { setViewAdmin(false); }}><Layers2 size={18}/> Branch loans</button>{admin ? <button className={`nav-item ${activeAdmin ? 'active' : ''}`} onClick={() => setViewAdmin(true)}><ShieldCheck size={18}/> Admin overview</button> : null}<button className="nav-item" onClick={() => setSettings(true)}><Settings2 size={18}/> Settings</button></nav>
      <div className="sidebar-bottom"><div className="network-note"><span className={`connection-dot ${!online ? 'offline' : ''}`}/>{online ? 'Shared workspace' : 'Offline'}</div><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={18}/> Help & install</button>{admin ? <button className="nav-item" onClick={logout}><LogOut size={18}/> Sign out of admin</button> : <button className="nav-item" onClick={() => setLogin(true)}><ShieldCheck size={18}/> Admin access</button>}<div className="sidebar-footer">13 branches. One workspace.</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{activeAdmin ? 'Admin overview' : 'Branch loans'}</strong></div><div className="topbar-actions"><button className="install-button" onClick={install}><Download size={15}/><span>Install app</span></button>{activeAdmin ? <span className="admin-label"><ShieldCheck size={14}/> Admin</span> : null}<button className="branch-switch" onClick={() => setSettings(true)}><Building2 size={16}/><span>{selected?.name || 'Select branch'}</span><ChevronDown size={14}/></button></div></header>
      <main>
        {!online ? <div className="message warning" role="status"><WifiOff size={17}/> You’re offline. Reconnect to load or save loans. Unsaved form details stay here.</div> : null}
        {error ? <div className="message error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { if (!ready) window.location.reload(); else refresh(); }}>Try again</button></div> : null}
        <section className="summary-grid" aria-label="Loan summary"><div className="summary-card"><div className="summary-label">Total applications <Layers2 size={17}/></div><strong>{loading ? '—' : tabLoans.length}</strong><span>{loading ? 'Loading…' : `${rupees(sum(tabLoans))} total value`}</span></div><div className="summary-card"><div className="summary-label">Pending <ArrowUpRight size={17}/></div><strong>{loading ? '—' : pendingLoans.length}</strong><span>{loading ? 'Loading…' : `${rupees(sum(pendingLoans))} in progress`}</span></div><div className="summary-card"><div className="summary-label">Sanctioned <ArrowDownLeft size={17}/></div><strong>{loading ? '—' : sanctionedLoans.length}</strong><span>{loading ? 'Loading…' : `${rupees(sum(sanctionedLoans))} sanctioned`}</span></div><div className="summary-card"><div className="summary-label">Action required <CheckCheck size={17}/></div><strong>{loading ? '—' : awaiting.length}</strong><span>Awaiting branch compliance</span></div></section>
        <section className="loan-panel" aria-label="Loan applications"><div className="panel-header"><div className="tabs" role="tablist" aria-label="Loan category"><button role="tab" aria-selected={category === 'new'} aria-controls="loans-panel" id="new-tab" className={category === 'new' ? 'selected' : ''} onClick={() => setCategory('new')}><FilePlus2 size={16}/> New loans <span>{loans.filter(l => l.category === 'new').length}</span></button><button role="tab" aria-selected={category === 'renewal'} aria-controls="loans-panel" id="renewal-tab" className={category === 'renewal' ? 'selected' : ''} onClick={() => setCategory('renewal')}><RefreshCw size={15}/> Renewals <span>{loans.filter(l => l.category === 'renewal').length}</span></button></div><button className="button primary add-loan" onClick={() => setForm('new')} disabled={!ready || (!activeAdmin && !branchId)}><Plus size={16}/> Add loan</button></div>
          <div className="table-toolbar"><label className="search-field"><Search size={17}/><input aria-label="Search ATS number" placeholder="Search ATS number…" value={search} onChange={e => setSearch(e.target.value)}/></label><div className="filters">{activeAdmin ? <select aria-label="Filter branch" value={adminFilter} onChange={e => setAdminFilter(e.target.value)}><option value="">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select> : null}<select aria-label="Filter status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="sanctioned">Sanctioned</option></select>{activeAdmin ? <select aria-label="Filter compliance" value={compliance} onChange={e => setCompliance(e.target.value)}><option value="">All compliance</option><option value="awaiting">Awaiting</option><option value="complied">Complied</option><option value="none">No remarks</option></select> : null}<button className="icon-button refresh-button" onClick={refresh} disabled={loading} aria-label="Refresh loans"><RefreshCw size={17} className={loading ? 'spin' : ''}/></button></div></div>
          <div id="loans-panel" role="tabpanel" aria-labelledby={category === 'new' ? 'new-tab' : 'renewal-tab'}>{loading ? <div className="loading-state"><RefreshCw size={23} className="spin"/><p>Loading shared applications…</p></div> : <LoanTable loans={visibleLoans} admin={activeAdmin} onEdit={setForm} onCompliance={complianceUpdate} busy={busy} filtered={!!(search || status || compliance)}/>}</div>
          <div className="table-footer"><span>{visibleLoans.length} {visibleLoans.length === 1 ? 'application' : 'applications'}{tabLoans.length !== visibleLoans.length ? ` of ${tabLoans.length}` : ''}</span><span><span className="connection-dot"/> {updated ? `Updated ${updated}` : 'Updates shared across devices'}</span></div>
        </section><div className="page-footer"><Leaf size={14}/><span>A clearer view of agricultural lending.</span><span className="footer-right">AMCC · Loan sourcing & renewals</span></div>
      </main>
    </div>
    {notice ? <div className="toast" role="status"><CheckCheck size={18}/>{notice}</div> : null}
    {ready && (settings || (!branchId && !activeAdmin)) && !login ? <Settings branches={branches} selected={branchId} admin={activeAdmin} initial={!branchId && !activeAdmin} onSelect={chooseBranch} onClose={branchId || activeAdmin ? () => setSettings(false) : undefined} onRenamed={list => { setBranches(list); setNotice('Branch name updated.'); refresh(); }} onAdmin={() => { setSettings(false); setLogin(true); }}/>: null}
    {login ? <AdminLogin onClose={() => setLogin(false)} onLogin={() => { setLogin(false); setAdmin(true); setViewAdmin(true); setAdminFilter(''); setNotice('Welcome to the admin workspace.'); }}/>: null}
    {form ? <LoanForm key={form === 'new' ? 'new' : form.id} branches={branches} branchId={activeAdmin ? adminFilter || branchId : branchId} category={category} loan={form === 'new' ? undefined : form} admin={activeAdmin} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNotice('Loan saved to the shared workspace.'); refresh(); }}/>: null}
    {help ? <Modal title="Your workspace, anywhere" subtitle="AMCC loan sourcing & renewals" onClose={() => setHelp(false)}><div className="help-content"><h3>Working with loans</h3><p>Select a branch, choose New loans or Renewals, and add the ATS number and amount. Read admin remarks and mark them complied with once the action is complete.</p><h3>Switching branches</h3><p>Use Settings or the branch selector at the top. Everyone with this link can switch between all thirteen branches.</p><h3>Install on your device</h3><p>In Chrome or Edge, use the browser’s Install app option. On iPhone or iPad, open in Safari, tap Share, then Add to Home Screen.</p><button type="button" className="button primary" onClick={install}><Download size={15}/> Show install steps</button><h3>Shared updates</h3><p>Loans are stored in a shared database. Keep an internet connection to save changes. The workspace refreshes automatically while open.</p></div></Modal> : null}
  </div>;
}
