'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Layers2, Leaf, LogOut, Plus, RefreshCw, Search, Settings as Gear, ShieldCheck, SlidersHorizontal, WifiOff } from 'lucide-react';
import type { Branch, Loan } from '../../lib/types';
import { request } from '../../lib/types';
import LoanTable from './LoanTable';
import LoanForm from './LoanForm';
import Settings from './Settings';
import AdminLogin from './AdminLogin';
import Modal from './Modal';
import InstallPrompt from './InstallPrompt';
import SummaryCarousel from './SummaryCarousel';

const preferenceKey = 'amcc.branch.v1';
const adminModeKey = 'amcc.adminMode.v1';
const branchesKey = 'amcc.branches.v1';
const rememberAdminMode = (on: boolean) => { try { if (on) localStorage.setItem(adminModeKey, '1'); else localStorage.removeItem(adminModeKey); } catch {} };
// Branch names (not loan records) are kept on the device so the app can render before the network answers.
const rememberBranches = (list: Branch[]) => { try { localStorage.setItem(branchesKey, JSON.stringify(list)); } catch {} };
const recentCount = 5;
const collapsedKey = 'amcc.collapsedGroups.v1';
type Category = 'new' | 'renewal';
const groups: { id: Category; label: string }[] = [{ id: 'new', label: 'New loans' }, { id: 'renewal', label: 'Renewals' }];
type View = 'all' | 'pending' | 'sanctioned';
const views: { id: View; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'sanctioned', label: 'Sanctioned' }];
const inView = (loan: Loan, view: View) => view === 'all' || loan.status === view;
export default function Workspace() {
  const [branches, setBranches] = useState<Branch[]>([]); const [branchId, setBranch] = useState('');
  const [admin, setAdmin] = useState(false); const [viewAdmin, setViewAdmin] = useState(false); const [adminFilter, setAdminFilter] = useState('');
  const [category, setCategory] = useState<Category>('new'); const [loans, setLoans] = useState<Loan[]>([]);
  const [search, setSearch] = useState(''); const [view, setView] = useState<View>('pending'); const [compliance, setCompliance] = useState('');
  const [loading, setLoading] = useState(true); const [ready, setReady] = useState(false); const [sessionChecked, setSessionChecked] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(false); const [login, setLogin] = useState(false); const [form, setForm] = useState<Loan | 'new' | null>(null); const [addChoice, setAddChoice] = useState(false);
  const [busy, setBusy] = useState(''); const [online, setOnline] = useState(true); const [help, setHelp] = useState(false); const [menu, setMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); const [filters, setFilters] = useState(false); const [showAll, setShowAll] = useState<Category[]>([]); const [collapsed, setCollapsed] = useState<Category[]>([]);
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
  function create(kind: 'new' | 'renewal') { setAddChoice(false); setCategory(kind); setForm('new'); }
  const filtered = !!(search || compliance);
  const visibleLoans = useMemo(() => loans.filter(loan => inView(loan, view) && `${loan.atsId} ${loan.borrowerName ?? ''} ${loan.branchName}`.toLowerCase().includes(search.toLowerCase()) && (!compliance || loan.compliance === compliance)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [loans, view, search, compliance]);
  const limited = view === 'all' || view === 'sanctioned';
  const grouped = groups.map(group => {
    const all = visibleLoans.filter(loan => loan.category === group.id);
    return { ...group, all, shown: showAll.includes(group.id) || filtered || !limited ? all : all.slice(0, recentCount) };
  });
  const viewLabel = views.find(v => v.id === view)!.label.toLowerCase();
  const emptyTitle = filtered ? 'No matching loans' : view === 'pending' ? 'Nothing pending' : view === 'sanctioned' ? 'No sanctioned loans' : 'No applications yet';
  const emptyText = filtered ? 'Try another ATS number or clear the filters.' : view === 'all' ? 'Add your first application to start tracking its progress.' : 'Choose All to see every application.';
  function chooseView(next: View) { setView(next); setShowAll([]); }
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(collapsedKey) || '[]'); if (Array.isArray(saved)) setCollapsed(saved.filter((id): id is Category => id === 'new' || id === 'renewal')); } catch {} }, []);
  function toggleGroup(id: Category) {
    setCollapsed(current => { const next = current.includes(id) ? current.filter(c => c !== id) : [...current, id]; try { localStorage.setItem(collapsedKey, JSON.stringify(next)); } catch {} return next; });
  }
  const activeFilters = (view !== 'all' ? 1 : 0) + (activeAdmin && adminFilter ? 1 : 0) + (activeAdmin && compliance ? 1 : 0);
  function clearFilters() { chooseView('all'); setAdminFilter(''); setCompliance(''); }
  return <div className="app-shell landscape-home">
    <div className="home-landscape" aria-hidden="true"/>
    <header className="appbar">
      <a className="brand" href="/" aria-label="AMCC Paonta Sahib loan tracker home"><span className="brand-icon"><Leaf size={23}/></span><span>AMCC<span className="brand-sub">PAONTA SAHIB</span></span></a>
      <div className="appbar-actions">{activeAdmin ? <button type="button" className="view-chip admin" onClick={() => setMenu(true)} aria-label="Admin view, open settings"><ShieldCheck aria-hidden="true"/><span>Admin</span></button> : <button type="button" className="view-chip" onClick={() => setSettings(true)} aria-label={selected ? `Branch ${selected.name}, change branch` : 'Select branch'}><Building2 aria-hidden="true"/><span>{selected?.name || 'Select branch'}</span></button>}<button className={`icon-button menu-button ${menu ? 'open' : ''}`} onClick={() => setMenu(!menu)} aria-label="Settings" title={selected ? `Settings · ${selected.name}` : 'Settings'} aria-expanded={menu} aria-haspopup="menu"><Gear size={20}/></button>
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
          <SummaryCarousel loans={loans} loading={loading} onStatus={status => chooseView(view === status ? 'all' : status)}/>
          <h2 className="sr-only">Add an application</h2>
          <button className="home-add-loan" onClick={() => setAddChoice(true)} disabled={!canAdd}><span className="home-add-icon"><Plus aria-hidden="true"/></span><span className="home-add-text"><strong>Add Loan</strong><span>New loan or renewal</span></span><svg className="home-add-mark" viewBox="0 0 64 72" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 6h34l14 14v42a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"/><path d="M42 6v14h14"/><path d="M14 30h12M20 24v12M34 30h12M14 48h12M34 46h12M34 52h12"/></svg><ChevronRight className="home-add-arrow" aria-hidden="true"/></button>
        </section>
        <section className="recent" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="sr-only">Applications</h2>
          <div className="table-toolbar"><label className="search-field"><Search size={21} strokeWidth={1.75}/><input aria-label="Search ATS number, borrower or branch" placeholder="Search ATS or name..." value={search} onChange={e => setSearch(e.target.value)}/></label><div className="filter-anchor"><button type="button" className={`filter-button ${activeFilters ? 'has-filters' : ''}`} onClick={() => setFilters(!filters)} aria-label={`Filters${activeFilters ? `, ${activeFilters} active` : ''}`} aria-expanded={filters} aria-haspopup="dialog"><SlidersHorizontal size={21} strokeWidth={1.9}/>{activeFilters ? <span className="filter-count" aria-hidden="true">{activeFilters}</span> : null}</button>
            {filters ? <><div className="menu-backdrop" onClick={() => setFilters(false)}/><div className="filter-panel" role="dialog" aria-label="Filters">
              <label>Show<span className="filter-select"><select value={view} onChange={e => chooseView(e.target.value as View)}>{views.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select><ChevronDown size={18}/></span></label>
              {activeAdmin ? <label>Branch<span className="filter-select"><select value={adminFilter} onChange={e => setAdminFilter(e.target.value)}><option value="">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><ChevronDown size={18}/></span></label> : null}
              {activeAdmin ? <label>Compliance<span className="filter-select"><select value={compliance} onChange={e => setCompliance(e.target.value)}><option value="">All compliance</option><option value="awaiting">Awaiting</option><option value="complied">Complied</option><option value="none">No remarks</option></select><ChevronDown size={18}/></span></label> : null}
              <div className="filter-panel-actions"><button type="button" className="text-button" onClick={clearFilters} disabled={!activeFilters}>Clear all</button><button type="button" className="button primary" onClick={() => setFilters(false)}>Done</button></div>
            </div></> : null}</div></div>
          {loading ? <div className="loading-state"><RefreshCw size={23} className="spin"/><p>Loading shared applications…</p></div>
            : !visibleLoans.length ? <LoanTable loans={[]} admin={activeAdmin} onEdit={setForm} onCompliance={complianceUpdate} busy={busy} filtered={filtered} emptyTitle={emptyTitle} emptyText={emptyText}/>
            : grouped.map(group => {
              const open = !collapsed.includes(group.id);
              return <div key={group.id} className={`loan-group ${open ? 'open' : ''}`}>
                <h3 className="loan-group-head"><button type="button" onClick={() => toggleGroup(group.id)} aria-expanded={open} aria-controls={`loan-group-${group.id}`}><ChevronDown className="loan-group-chevron" aria-hidden="true"/><span>{group.label}</span><span className="loan-group-count">{group.all.length}</span></button></h3>
                <div className="loan-group-body" id={`loan-group-${group.id}`} inert={!open}><div>
                  {group.all.length ? <LoanTable loans={group.shown} admin={activeAdmin} onEdit={setForm} onCompliance={complianceUpdate} busy={busy} filtered={filtered} emptyTitle={emptyTitle} emptyText={emptyText}/> : <p className="loan-group-empty">No {group.label.toLowerCase()} {filtered ? 'match' : view === 'all' ? 'yet' : viewLabel}.</p>}
                  {group.all.length > group.shown.length ? <button className="show-more" onClick={() => setShowAll(current => [...current, group.id])}>Show all {group.all.length} {view === 'all' ? '' : viewLabel + ' '}{group.label.toLowerCase()}</button> : null}
                </div></div>
              </div>;
            })}
        </section>
      </main>
    {notice ? <div className="toast" role="status"><CheckCheck size={18}/>{notice}</div> : null}
    {addChoice ? <Modal chooser title="Add Loan" subtitle="What would you like to add?" icon={<Leaf size={22}/>} onClose={() => setAddChoice(false)}><div className="loan-type-choices">
      <button type="button" className="loan-type-choice new" onClick={() => create('new')}><span className="choice-icon" aria-hidden="true"><Plus size={24}/></span><span className="choice-text"><strong>New loan</strong><span>Start a fresh application</span></span><ChevronRight className="choice-arrow" size={20} aria-hidden="true"/></button>
      <button type="button" className="loan-type-choice renewal" onClick={() => create('renewal')}><span className="choice-icon" aria-hidden="true"><RefreshCw size={22}/></span><span className="choice-text"><strong>Renewal</strong><span>Renew an existing loan</span></span><ChevronRight className="choice-arrow" size={20} aria-hidden="true"/></button>
    </div></Modal> : null}
    {ready && (settings || (!branchId && !activeAdmin)) && !login ? <Settings branches={branches} selected={activeAdmin ? adminFilter : branchId} admin={activeAdmin} initial={!branchId && !activeAdmin} onSelect={chooseBranch} onClose={branchId || activeAdmin ? () => setSettings(false) : undefined} onRenamed={list => { setBranches(list); rememberBranches(list); setNotice('Branch name updated.'); refresh(); }} onAdmin={() => { setSettings(false); setLogin(true); }}/>: null}
    {login ? <AdminLogin onClose={() => setLogin(false)} onLogin={() => { setLogin(false); setAdmin(true); setViewAdmin(true); rememberAdminMode(true); setAdminFilter(''); setNotice('Welcome to the admin workspace.'); }}/>: null}
    {form ? <LoanForm key={form === 'new' ? 'new' : form.id} branches={branches} branchId={activeAdmin ? adminFilter || branchId : branchId} category={category} loan={form === 'new' ? undefined : form} admin={activeAdmin} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNotice('Loan saved to the shared workspace.'); refresh(); }} onDeleted={() => { setForm(null); setNotice('Application deleted.'); refresh(); }}/>: null}
    {help ? <Modal title="Your workspace, anywhere" subtitle="AMCC loan sourcing & renewals" onClose={() => setHelp(false)}><div className="help-content"><h3>Working with loans</h3><p>Select a branch, choose New loans or Renewals, and add the ATS number and amount. Read admin remarks and mark them complied with once the action is complete.</p><h3>Switching branches</h3><p>Use Settings or the branch selector at the top. Everyone with this link can switch between all thirteen branches.</p><h3>Shared updates</h3><p>Loans are stored in a shared database. Keep an internet connection to save changes. The workspace refreshes automatically while open.</p></div></Modal> : null}
    <InstallPrompt canShow={ready && sessionChecked && (!!branchId || activeAdmin) && !settings && !login && !form && !help}/>
  </div>;
}
