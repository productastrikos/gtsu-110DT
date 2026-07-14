import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../../services/socket';
import type { Alert } from '../../services/socket';
import AlertPanel from '../AlertPanel';
import AlertDetailModal from '../AlertDetailModal';
import AdvisoryPanel from '../AdvisoryPanel';

/* Where each alert's "Investigate" button leads */
const ROUTE_LABELS: Record<string, string> = {
  '/':           'Post-Flight Analysis',
  '/simulator':  '3D Process Simulator',
  '/life-cycle': 'Life Cycle & Reliability',
  '/sandbox':    'Performance Sandbox',
};
function routeForAlert(a: Alert): string {
  if (a.route) return a.route;
  switch (a.category) {
    case 'thermal':
    case 'vibration': return '/simulator';
    case 'mechanical':
    case 'lifecycle': return '/life-cycle';
    default:          return '/';
  }
}

/* ─── Navigation structure ─────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: 'Workspace',
    items: [
      { path: '/',           icon: 'M9 17v-6h6v6m4-9H5m14 0a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2m14 0V5a2 2 0 00-2-2H7a2 2 0 00-2 2v3', label: 'Post-Flight Analysis' },
      { path: '/simulator',  icon: 'M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5', label: '3D Process Simulator' },
      { path: '/life-cycle', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Life Cycle & Reliability' },
      { path: '/sandbox',    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', label: 'Performance Sandbox' },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/':           'Post-Flight Analysis',
  '/simulator':  '3D Process Simulator',
  '/life-cycle': 'Life Cycle & Reliability',
  '/sandbox':    'Performance Sandbox',
  '/profile':    'Profile',
};

const SEARCH_INDEX = [
  /* ── Post-Flight Analysis ── */
  { label:'Post-Flight Analysis', path:'/',           breadcrumb:['Workspace'],                 icon:'✈', keywords:'post flight analysis simulation cycles faults improvement landing' },
  { label:'Run Flight Simulation',path:'/',           breadcrumb:['Workspace','Action'],        icon:'▶', keywords:'simulate flight hours duration cycles generate trigger' },
  { label:'Start Cycle Log',      path:'/',           breadcrumb:['Workspace','Cycles'],        icon:'📋', keywords:'start cycle log table 40 second status fault' },
  { label:'Fault Breakdown',      path:'/',           breadcrumb:['Workspace','Faults'],        icon:'⚠', keywords:'fault reason breakdown hot start hung compressor' },

  /* ── 3D Process Simulator ── */
  { label:'3D Process Simulator', path:'/simulator',  breadcrumb:['Workspace'],                 icon:'⚙', keywords:'3d simulator process physics replay cycle visualization' },
  { label:'Replay Cycle',         path:'/simulator',  breadcrumb:['Workspace','Replay'],        icon:'▶', keywords:'replay cycle play pause speed 3d visualization' },
  { label:'Live Test-Rig Mode',   path:'/simulator',  breadcrumb:['Workspace','Live'],          icon:'●', keywords:'live telemetry test rig ingest real time stream physical engine' },
  { label:'Phase Indicator',      path:'/simulator',  breadcrumb:['Workspace','Phases'],        icon:'⚡', keywords:'phase cranking light up acceleration self sustaining' },

  /* ── Life Cycle & Reliability ── */
  { label:'Life Cycle & Reliability', path:'/life-cycle', breadcrumb:['Workspace'],            icon:'⏱', keywords:'life cycle reliability wear degradation component fail first' },
  { label:'Life-Limiting Component',  path:'/life-cycle', breadcrumb:['Workspace','Forecast'], icon:'🔥', keywords:'fail first life limit component dictates engine' },
  { label:'Engine Life Limit',        path:'/life-cycle', breadcrumb:['Workspace','Forecast'], icon:'⏱', keywords:'engine life limit hours remaining forecast' },
  { label:'Wear Progression',         path:'/life-cycle', breadcrumb:['Workspace','Wear'],     icon:'📈', keywords:'wear progression chart cumulative component history' },

  /* ── Performance Sandbox ── */
  { label:'Performance Sandbox',  path:'/sandbox',    breadcrumb:['Workspace'],                 icon:'🔬', keywords:'sandbox performance optimization power sfc fuel blade rpm' },
  { label:'Fuel Flow',            path:'/sandbox',    breadcrumb:['Workspace','Inputs'],        icon:'⛽', keywords:'fuel flow kg per hour input parameter slider' },
  { label:'Blade Angle (IGV)',    path:'/sandbox',    breadcrumb:['Workspace','Inputs'],        icon:'🌀', keywords:'blade angle igv inlet guide vane parameter' },
  { label:'RPM Target',           path:'/sandbox',    breadcrumb:['Workspace','Inputs'],        icon:'⚙', keywords:'rpm target ngg percent input parameter' },
  { label:'Power vs SFC',         path:'/sandbox',    breadcrumb:['Workspace','Outputs'],       icon:'📊', keywords:'power sfc specific fuel consumption trade off comparison' },

  /* ── Profile ── */
  { label:'Profile',              path:'/profile',    breadcrumb:['Profile'],                   icon:'👤', keywords:'account settings user role preferences' },
];

function SvgIcon({ d, size = 'w-4 h-4', strokeWidth = 1.6 }: { d: string; size?: string; strokeWidth?: number }) {
  return (
    <svg className={`${size} flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d={d} />
    </svg>
  );
}

interface User { fullName?: string; role?: string; }

interface LayoutProps {
  children: React.ReactNode;
  user?: User | null;
  onLogout?: () => void;
  theme?: 'dark' | 'light';
  onThemeToggle?: () => void;
}

export default function Layout({ children, user, onLogout, theme = 'dark', onThemeToggle }: LayoutProps) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { alerts, advisories, acknowledgeAlert, acknowledgeAdvisory } = useData();
  const [showAlerts,   setShowAlerts]   = useState(false);
  const [showAdvisory, setShowAdvisory] = useState(false);
  const [showProfile,  setShowProfile]  = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [time,         setTime]         = useState(new Date());
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [showSearch,   setShowSearch]   = useState(false);
  const profileRef    = useRef<HTMLDivElement>(null);
  const searchRef     = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setShowSearch(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!showSearch) return;
    const onDocClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showSearch]);

  useEffect(() => {
    if (!showProfile) return;
    const onDocClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowProfile(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [showProfile]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/).filter(Boolean);
    const scored = SEARCH_INDEX.map(item => {
      const haystack = [item.label, ...(item.breadcrumb || []), item.keywords || ''].join(' ').toLowerCase();
      const matchCount = words.filter(w => haystack.includes(w)).length;
      return { item, matchCount };
    }).filter(({ matchCount }) => matchCount > 0);
    scored.sort((a, b) => {
      const aL = a.item.label.toLowerCase().includes(q) ? 1 : 0;
      const bL = b.item.label.toLowerCase().includes(q) ? 1 : 0;
      if (bL !== aL) return bL - aL;
      return b.matchCount - a.matchCount;
    });
    return scored.slice(0, 10).map(({ item }) => item);
  }, [searchQuery]);

  const unacknowledgedAlerts = alerts?.filter(a => !a.acknowledged)?.length || 0;
  const criticalAlerts       = alerts?.filter(a => a.type === 'critical' && !a.acknowledged)?.length || 0;
  const pageTitle            = PAGE_TITLES[location.pathname] || 'Dashboard';
  const initials             = user?.fullName?.charAt(0) || 'U';

  /* ── Mission-bar derived values ─────────────────────────── */
  return (
    <div className={`theme-${theme} h-screen w-screen flex overflow-hidden bg-cwm-dark`}>

      {/* ── SIDEBAR ──────────────────────────────────────────── */}
      <aside
        className="flex flex-col shrink-0 overflow-hidden transition-all duration-200 bg-cwm-darker border-r border-cwm-border"
        style={{ width: sidebarOpen ? 'var(--cwm-sidebar-w, 244px)' : '60px' }}
      >
        {/* Logo row */}
        <div
          className="flex items-center gap-3 px-4 cursor-pointer shrink-0 border-b border-cwm-border"
          style={{ height: 'var(--cwm-header-h, 62px)' }}
          onClick={() => navigate('/')}
        >
          <div style={{ height: sidebarOpen ? 76 : 60, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'flex-start', transition: 'height 0.2s ease' }}>
            <img
              src="/Logo Transparent Horizontal.png"
              alt="Astrikos"
              style={{ height: sidebarOpen ? 120 : 96, marginTop: sidebarOpen ? -20 : -16, width: 'auto', display: 'block', filter: 'var(--cwm-logo-filter, none)' }}
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {sidebarOpen && <p className="nav-section-label">{section.label}</p>}
              {!sidebarOpen && <div className="h-3" />}
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <div key={item.path} className="px-2">
                    <button onClick={() => navigate(item.path)} className={`nav-item w-full ${isActive ? 'active' : ''}`} title={!sidebarOpen ? item.label : undefined}>
                      <SvgIcon d={item.icon} />
                      {sidebarOpen && <span className="truncate">{item.label}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom: user + logout */}
        <div className="shrink-0 border-t border-cwm-border">
          {sidebarOpen && user && (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: 'var(--cwm-accent)' }}>
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--cwm-text)' }}>{user.fullName}</div>
                <div className="text-[10px] truncate capitalize" style={{ color: 'var(--cwm-text-faint)' }}>{user.role?.replace('_', ' ')}</div>
              </div>
            </div>
          )}
          <div className="px-2 pb-3">
            <button onClick={onLogout} className="nav-item w-full" style={{ color: 'var(--cwm-text-faint)' }} title={!sidebarOpen ? 'Logout' : undefined}>
              <SvgIcon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              {sidebarOpen && <span>Logout</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── TOPBAR ──────────────────────────────────────────── */}
        <header className="shrink-0 flex items-center gap-3 px-4 border-b border-cwm-border" style={{ height: 'var(--cwm-header-h, 62px)', background: 'var(--cwm-panel)' }}>
          <button onClick={() => setSidebarOpen(o => !o)} className="icon-btn" title="Toggle sidebar">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="hidden sm:flex flex-col ml-1">
            <span className="text-[11px] font-bold tracking-widest" style={{ color: 'var(--cwm-text)', letterSpacing: '0.10em' }}>GTSU COMMAND CENTER</span>
            <span className="text-[9px]" style={{ color: 'var(--cwm-text-faint)' }}>{pageTitle}</span>
          </div>

          {/* Search */}
          <div className="header-search flex-1 max-w-xs ml-3" ref={searchRef} style={{ position: 'relative' }}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--cwm-text-faint)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search anything… (Ctrl+K)"
              aria-label="Search"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Enter' && searchResults.length > 0) { navigate(searchResults[0].path); setShowSearch(false); setSearchQuery(''); }
              }}
            />
            {showSearch && searchQuery.trim() && (
              <div className="search-dropdown">
                {searchResults.length === 0
                  ? <div className="search-dropdown-empty">No results for "{searchQuery}"</div>
                  : searchResults.map((item, idx) => (
                    <button key={idx} className="search-dropdown-item" onMouseDown={(e) => { e.preventDefault(); navigate(item.path); setShowSearch(false); setSearchQuery(''); }}>
                      <div className="sdi-icon">{item.icon}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="sdi-label">{item.label}</div>
                        <div className="sdi-desc">{item.breadcrumb.join(' › ')}</div>
                      </div>
                    </button>
                  ))
                }
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Live time */}
          <div className="hidden md:block font-mono text-xs px-2 py-1 rounded-md" style={{ background: 'var(--cwm-surface-soft)', color: 'var(--cwm-text-muted)', border: '1px solid var(--cwm-border)', letterSpacing: '0.04em' }}>
            {time.toLocaleTimeString('en-GB', { hour12: false })}
          </div>

          {/* Theme toggle */}
          <button onClick={onThemeToggle} className="icon-btn" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0L16.95 7.05M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1012 21a8.962 8.962 0 008.354-5.646z" /></svg>
            )}
          </button>

          {/* AI Advisory */}
          <button onClick={() => { setShowAdvisory(s => !s); setShowAlerts(false); }} className={`cwm-advisory-btn ${showAdvisory ? 'active' : ''}`} title="AI Engine Advisory">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            <span>AI Advisory</span>
          </button>

          {/* Alerts bell */}
          <button onClick={() => { setShowAlerts(s => !s); setShowAdvisory(false); }} className={`icon-btn ${showAlerts ? 'active' : ''}`} title="Alerts">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            {unacknowledgedAlerts > 0 && (
              <span className={`absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[9px] flex items-center justify-center font-bold px-0.5 ${criticalAlerts > 0 ? 'animate-pulse' : ''}`}
                style={{ background: criticalAlerts > 0 ? 'var(--cwm-danger)' : 'var(--cwm-warning)', color: 'var(--cwm-on-color)' }}>
                {unacknowledgedAlerts}
              </span>
            )}
          </button>

          {/* Profile */}
          <div className="relative" ref={profileRef}>
            <button type="button" className="profile-trigger" onClick={() => setShowProfile(s => !s)} title={user?.fullName || 'Account'}>
              {initials}
            </button>
            {showProfile && (
              <div className="profile-menu" role="menu">
                <div className="profile-menu-header">
                  <div className="avatar">{initials}</div>
                  <div className="min-w-0">
                    <div className="name truncate">{user?.fullName || 'Account'}</div>
                    <div className="status">Online</div>
                  </div>
                </div>
                <div className="profile-menu-section">
                  <button className="profile-menu-item" role="menuitem" onClick={() => { setShowProfile(false); navigate('/profile'); }}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    Profile
                  </button>
                  <button className="profile-menu-item" role="menuitem" onClick={() => { setShowProfile(false); setShowAlerts(true); setShowAdvisory(false); }}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                    Notifications
                  </button>
                  <button className="profile-menu-item" role="menuitem" onClick={() => { setShowProfile(false); onThemeToggle && onThemeToggle(); }}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    Settings
                  </button>
                </div>
                <div className="profile-menu-section">
                  <button className="profile-menu-item danger" role="menuitem" onClick={() => { setShowProfile(false); onLogout && onLogout(); }}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* ── CONTENT + PANELS ──────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-auto p-4">
            {children}
          </main>

          {showAlerts && (
            <div className="w-80 shrink-0 overflow-hidden animate-slide-up border-l border-cwm-border" style={{ background: 'var(--cwm-surface)' }}>
              <AlertPanel alerts={alerts} onClose={() => setShowAlerts(false)} onAcknowledge={acknowledgeAlert} onSelect={setSelectedAlert} />
            </div>
          )}

          {showAdvisory && (
            <div className="cwm-advisory-panel w-96 shrink-0 overflow-hidden animate-slide-up border-l" style={{ borderColor: 'var(--cwm-advisory-border)' }}>
              <AdvisoryPanel advisories={advisories} onClose={() => setShowAdvisory(false)} onAcknowledge={acknowledgeAdvisory} />
            </div>
          )}
        </div>
      </div>

      {/* Alert detail popup → redirect to the relevant page */}
      {selectedAlert && (
        <AlertDetailModal
          alert={selectedAlert}
          destinationLabel={ROUTE_LABELS[routeForAlert(selectedAlert)] ?? 'Details'}
          onClose={() => setSelectedAlert(null)}
          onAcknowledge={() => { acknowledgeAlert(selectedAlert.alertId); setSelectedAlert(null); }}
          onInvestigate={() => {
            const dest = routeForAlert(selectedAlert);
            setSelectedAlert(null);
            setShowAlerts(false);
            navigate(dest);
          }}
        />
      )}
    </div>
  );
}
