'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Building2, CheckCheck, CircleCheck, Clock, ChevronDown, CircleHelp, Layers2, Leaf, ListFilter, LogOut, Plus, RefreshCw, Search, Settings as Gear, ShieldCheck, WifiOff } from 'lucide-react';
import type { Branch, Loan } from '../../lib/types';
import { request } from '../../lib/types';
import LoanTable from './LoanTable';
import LoanForm from './LoanForm';
import Settings from './Settings';
import AdminLogin from './AdminLogin';
import Modal from './Modal';
import InstallPrompt from './InstallPrompt';

const preferenceKey = 'amcc.branch.v1';
const adminModeKey = 'amcc.adminMode.v1';
const branchesKey = 'amcc.branches.v1';
const rememberAdminMode = (on: boolean) => { try { if (on) localStorage.setItem(adminModeKey, '1'); else localStorage.removeItem(adminModeKey); } catch {} };
// Branch names (not loan records) are kept on the device so the app can render before the network answers.
const rememberBranches = (list: Branch[]) => { try { localStorage.setItem(branchesKey, JSON.stringify(list)); } catch {} };
const recentCount = 5;
type View = 'all' | 'pending' | 'sanctioned';
const views: { id: View; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'sanctioned', label: 'Sanctioned' }];
const inView = (loan: Loan, view: View) => view === 'all' || loan.status === view;
export default function Workspace() {
  const [branches, setBranches] = useState<Branch[]>([]); const [branchId, setBranch] = useState('');
  const [admin, setAdmin] = useState(false); const [viewAdmin, setViewAdmin] = useState(false); const [adminFilter, setAdminFilter] = useState('');
  const [category, setCategory] = useState<'new' | 'renewal'>('new'); const [loans, setLoans] = useState<Loan[]>([]);
  const [search, setSearch] = useState(''); const [view, setView] = useState<View>('pending'); const [compliance, setCompliance] = useState('');
  const [loading, setLoading] = useState(true); const [ready, setReady] = useState(false); const [sessionChecked, setSessionChecked] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false); const [login, setLogin] = useState(false); const [form, setForm] = useState<Loan | 'new' | null>(null);
  const [busy, setBusy] = useState(''); const [online, setOnline] = useState(true); const [help, setHelp] = useState(false); const [menu, setMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); const [filters, setFilters] = useState(false); const [showAll, setShowAll] = useState(false);
  const activeAdmin = admin && viewAdmin;
  const filterBranch = activeAdmin ? adminFilter : branchId;
  const selected = branches.find(b => b.id === branchId);
  const refresh = useCallback(() => setRefreshKey(key => key + 1), []);
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let stored = ''; try { stored = localStorage.getItem(preferenceKey) || ''; } catch {}
    let adminMode = false; try { adminMode = localStorage.getItem(adminModeKey) === '1'; } catch {}
    let cached: Branch[] = []; try { const parsed = JSON.parse(localStorage.getItem(branchesKey) || '[]'); if (Array.isArray(parsed)) cached = parsed; } catch {}
    // Start loading loans right away from the remembered branch or admin view; branches and session are checked alongside.
    if (cached.length) setBranches(cached);
    if (adminMode) { setAdmin(true); setViewAdmin(true); }
    if (stored) setBranch(stored);
    if (adminMode || stored) setReady(true);
    Promise.all([request<Branch[]>('/api/branches'), request<{ admin: boolean }>('/api/admin/session')]).then(([list, session]) => {
      if (!alive) return;
      setBranches(list); rememberBranches(list); setAdmin(session.admin);
      const validBranch = list.some(b => b.id === stored);
      if (!validBranch) setBranch('');
      if (!session.admin) { setViewAdmin(false); if (adminMode) setLogin(true); }
      // Nothing to load until a branch is picked.
      if (!validBranch && !(session.admin && adminMode)) { loadedKey.current = null; setLoans([]); setLoading(false); }
      setSessionChecked(true);
      setReady(true);
    }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ready || (!activeAdmin && !branchId)) return;
    let alive = true;
    // Only blank the list when switching to a different set of loans; a refresh of the same view keeps rows on screen.
    const key = activeAdmin ? `admin:${filterBranch}` : branchId;
    if (loadedKey.current !== key) { loadedKey.current = key; setLoading(true); setLoans([]); }
    setError('');
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
  useEffect(() => { if (!filters) return; const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilters(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [filters]);
  useEffect(() => { if (!menu) return; const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [menu]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);

  function chooseBranch(id: string) { setBranch(id); setSettings(false); if (activeAdmin) setAdminFilter(id); try { localStorage.setItem(preferenceKey, id); } catch {} setSearch(''); }
  async function complianceUpdate(loan: Loan) {
    setBusy(loan.id); setError('');
    try { await request(`/api/loans/${loan.id}`, { method: 'PATCH', body: JSON.stringify({ version: loan.version, compliance: loan.compliance === 'complied' ? 'awaiting' : 'complied' }) }); setNotice(loan.compliance === 'complied' ? 'Compliance reopened.' : 'Marked as complied.'); refresh(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function logout() {
    try { await request('/api/admin/session', { method: 'DELETE' }); setAdmin(false); setViewAdmin(false); rememberAdminMode(false); setNotice('Signed out of admin.'); }
    catch(e) { setError((e as Error).message); }
  }
  const canAdd = ready && (activeAdmin || !!branchId);
  function create(kind: 'new' | 'renewal') { setCategory(kind); setForm('new'); }
  const tabLoans = loans.filter(loan => loan.category === category);
  const filtered = !!(search || compliance);
  const visibleLoans = useMemo(() => tabLoans.filter(loan => inView(loan, view) && loan.atsId.toLowerCase().includes(search.toLowerCase()) && (!compliance || loan.compliance === compliance)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [loans, category, view, search, compliance]);
  const limited = view === 'all' || view === 'sanctioned';
  const shownLoans = showAll || filtered || !limited ? visibleLoans : visibleLoans.slice(0, recentCount);
  const viewLabel = views.find(v => v.id === view)!.label.toLowerCase();
  const emptyTitle = filtered ? 'No matching loans' : !loans.length ? 'No applications yet' : view === 'pending' ? 'Nothing pending' : view === 'sanctioned' ? 'No sanctioned loans' : 'No applications yet';
  const emptyText = filtered ? 'Try another ATS number or clear the filters.' : !loans.length || view === 'all' ? 'Add your first application to start tracking its progress.' : 'Choose All to see every application.';
  const pendingLoans = loans.filter(l => l.status === 'pending'); const sanctionedLoans = loans.filter(l => l.status === 'sanctioned');
  const awaiting = loans.filter(l => l.status === 'pending' && l.compliance === 'awaiting');
  const statFilters = [{ id: 'pending' as View, label: 'Pending', Icon: Clock, count: pendingLoans.length }, { id: 'sanctioned' as View, label: 'Sanctioned', Icon: CircleCheck, count: sanctionedLoans.length }];
  function chooseView(next: View) { setView(next); setShowAll(false); }
  const activeFilters = (view !== 'all' ? 1 : 0) + (activeAdmin && adminFilter ? 1 : 0) + (activeAdmin && compliance ? 1 : 0);
  function clearFilters() { chooseView('all'); setAdminFilter(''); setCompliance(''); }
  return <div className="app-shell">
    <header className="appbar">
      <a className="brand" href="/" aria-label="AMCC Paonta Sahib loan tracker home"><span className="brand-icon"><Leaf size={23}/></span><span>AMCC<span className="brand-sub">PAONTA SAHIB</span></span></a>
      <div className="appbar-actions">{activeAdmin ? <span className="admin-label"><ShieldCheck size={14}/> Admin</span> : null}{!activeAdmin ? <button className="branch-switch" onClick={() => setSettings(true)}><span>{selected?.name || 'Select branch'}</span><ChevronDown size={14}/></button> : null}<button className={`icon-button menu-button ${menu ? 'open' : ''}`} onClick={() => setMenu(!menu)} aria-label="Settings" aria-expanded={menu} aria-haspopup="menu"><Gear size={20}/></button>
        {menu ? <><div className="menu-backdrop" onClick={() => setMenu(false)}/><div className="app-menu" role="menu" onClick={() => setMenu(false)}>
          {activeAdmin ? <div className="menu-label"><ShieldCheck size={13}/> Admin view</div> : null}
          <button role="menuitem" className={!activeAdmin ? 'current' : ''} onClick={() => { setViewAdmin(false); rememberAdminMode(false); }}><Layers2 size={17}/> Branch loans</button>
          {admin ? <button role="menuitem" className={activeAdmin ? 'current' : ''} onClick={() => { setViewAdmin(true); rememberAdminMode(true); }}><ShieldCheck size={17}/> Admin overview</button> : null}
          <button role="menuitem" onClick={() => setSettings(true)}><Building2 size={17}/> {activeAdmin ? 'Branch settings' : 'Change branch'}</button>
          <div className="menu-divider"/>
          <button role="menuitem" onClick={() => setHelp(true)}><CircleHelp size={17}/> Help</button>
          {admin ? <button role="menuitem" onClick={logout}><LogOut size={17}/> Sign out of admin</button> : <button role="menuitem" onClick={() => setLogin(true)}><ShieldCheck size={17}/> Admin access</button>}
          <div className="menu-status"><span className={`connection-dot ${!online ? 'offline' : ''}`}/>{online ? 'Shared workspace' : 'Offline'}</div>
        </div></> : null}
      </div>
    </header>
      <main>
        {!online ? <div className="message warning" role="status"><WifiOff size={17}/> You’re offline. Reconnect to load or save loans. Unsaved form details stay here.</div> : null}
        {error ? <div className="message error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { if (!ready || !branches.length) window.location.reload(); else refresh(); }}>Try again</button></div> : null}
        <section className="summary" aria-label="Loan summary">
          <div className="status-band" role="group" aria-label="Filter applications by status">
            {statFilters.map(f => <button key={f.id} type="button" className={`status-stat ${f.id} ${view === f.id ? 'active' : ''}`} aria-pressed={view === f.id} onClick={() => chooseView(view === f.id ? 'all' : f.id)}>{f.id === 'pending' && !loading && awaiting.length > 0 ? <span className="pending-alert-badge" aria-label={`${awaiting.length} pending ${awaiting.length === 1 ? 'alert' : 'alerts'}`}><Bell size={12} aria-hidden="true"/>{awaiting.length}</span> : null}<span className="status-figure"><f.Icon size={26} strokeWidth={2}/><strong>{loading ? '—' : f.count}</strong></span><span className="status-label">{f.label}</span></button>)}
          </div>
          <h2 className="sr-only">Add an application</h2>
          <div className="quick-add">
            <button className="quick-add-btn" onClick={() => create('new')} disabled={!canAdd}><span className="quick-add-icon"><Plus size={22} strokeWidth={1.8}/></span><span className="quick-add-text"><strong>New loan</strong><span>Add a fresh application</span></span></button>
            <button className="quick-add-btn" onClick={() => create('renewal')} disabled={!canAdd}><span className="quick-add-icon"><Plus size={22} strokeWidth={1.8}/></span><span className="quick-add-text"><strong>Renewal</strong><span>Add a renewal</span></span></button>
          </div>
        </section>
        <section className="recent" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="sr-only">Applications</h2>
          <div className="tabs" role="tablist" aria-label="Loan category"><button role="tab" aria-selected={category === 'new'} aria-controls="loans-panel" id="new-tab" className={category === 'new' ? 'selected' : ''} onClick={() => setCategory('new')}>New loans <span>{loading ? 0 : loans.filter(l => l.category === 'new' && inView(l, view)).length}</span></button><span className="tab-divider" aria-hidden="true"/><button role="tab" aria-selected={category === 'renewal'} aria-controls="loans-panel" id="renewal-tab" className={category === 'renewal' ? 'selected' : ''} onClick={() => setCategory('renewal')}>Renewals <span>{loading ? 0 : loans.filter(l => l.category === 'renewal' && inView(l, view)).length}</span></button></div>
          <div className="table-toolbar"><label className="search-field"><Search size={21} strokeWidth={1.75}/><input aria-label="Search ATS number" placeholder="Search ATS…" value={search} onChange={e => setSearch(e.target.value)}/></label><div className="filter-anchor"><button type="button" className={`filter-button ${activeFilters ? 'has-filters' : ''}`} onClick={() => setFilters(!filters)} aria-label={`Filters${activeFilters ? `, ${activeFilters} active` : ''}`} aria-expanded={filters} aria-haspopup="dialog"><ListFilter size={21} strokeWidth={1.9}/>{activeFilters ? <span className="filter-count" aria-hidden="true">{activeFilters}</span> : null}</button>
            {filters ? <><div className="menu-backdrop" onClick={() => setFilters(false)}/><div className="filter-panel" role="dialog" aria-label="Filters">
              <label>Show<span className="filter-select"><select value={view} onChange={e => chooseView(e.target.value as View)}>{views.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select><ChevronDown size={18}/></span></label>
              {activeAdmin ? <label>Branch<span className="filter-select"><select value={adminFilter} onChange={e => setAdminFilter(e.target.value)}><option value="">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><ChevronDown size={18}/></span></label> : null}
              {activeAdmin ? <label>Compliance<span className="filter-select"><select value={compliance} onChange={e => setCompliance(e.target.value)}><option value="">All compliance</option><option value="awaiting">Awaiting</option><option value="complied">Complied</option><option value="none">No remarks</option></select><ChevronDown size={18}/></span></label> : null}
              <div className="filter-panel-actions"><button type="button" className="text-button" onClick={clearFilters} disabled={!activeFilters}>Clear all</button><button type="button" className="button primary" onClick={() => setFilters(false)}>Done</button></div>
            </div></> : null}</div></div>
          <div id="loans-panel" role="tabpanel" aria-labelledby={category === 'new' ? 'new-tab' : 'renewal-tab'}>{loading ? <div className="loading-state"><RefreshCw size={23} className="spin"/><p>Loading shared applications…</p></div> : <LoanTable loans={shownLoans} admin={activeAdmin} onEdit={setForm} onCompliance={complianceUpdate} busy={busy} filtered={filtered} emptyTitle={emptyTitle} emptyText={emptyText}/>}</div>
          {!loading && visibleLoans.length > shownLoans.length ? <button className="show-more" onClick={() => setShowAll(true)}>Show all {visibleLoans.length} {view === 'all' ? '' : viewLabel + ' '}{category === 'new' ? 'new loans' : 'renewals'}</button> : null}
        </section>
      </main>
    {notice ? <div className="toast" role="status"><CheckCheck size={18}/>{notice}</div> : null}
    {ready && (settings || (!branchId && !activeAdmin)) && !login ? <Settings branches={branches} selected={activeAdmin ? adminFilter : branchId} admin={activeAdmin} initial={!branchId && !activeAdmin} onSelect={chooseBranch} onClose={branchId || activeAdmin ? () => setSettings(false) : undefined} onRenamed={list => { setBranches(list); rememberBranches(list); setNotice('Branch name updated.'); refresh(); }} onAdmin={() => { setSettings(false); setLogin(true); }}/>: null}
    {login ? <AdminLogin onClose={() => setLogin(false)} onLogin={() => { setLogin(false); setAdmin(true); setViewAdmin(true); rememberAdminMode(true); setAdminFilter(''); setNotice('Welcome to the admin workspace.'); }}/>: null}
    {form ? <LoanForm key={form === 'new' ? 'new' : form.id} branches={branches} branchId={activeAdmin ? adminFilter || branchId : branchId} category={category} loan={form === 'new' ? undefined : form} admin={activeAdmin} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNotice('Loan saved to the shared workspace.'); refresh(); }} onDeleted={() => { setForm(null); setNotice('Application deleted.'); refresh(); }}/>: null}
    {help ? <Modal title="Your workspace, anywhere" subtitle="AMCC loan sourcing & renewals" onClose={() => setHelp(false)}><div className="help-content"><h3>Working with loans</h3><p>Select a branch, choose New loans or Renewals, and add the ATS number and amount. Read admin remarks and mark them complied with once the action is complete.</p><h3>Switching branches</h3><p>Use Settings or the branch selector at the top. Everyone with this link can switch between all thirteen branches.</p><h3>Shared updates</h3><p>Loans are stored in a shared database. Keep an internet connection to save changes. The workspace refreshes automatically while open.</p></div></Modal> : null}
    <InstallPrompt canShow={ready && sessionChecked && (!!branchId || activeAdmin) && !settings && !login && !form && !help}/>
  </div>;
}
