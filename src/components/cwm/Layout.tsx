import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../../services/socket';
import { useGTSUStore } from '../../store/useGTSUStore';
import AlertPanel from '../AlertPanel';
import AdvisoryPanel from '../AdvisoryPanel';

/* ─── Navigation structure ─────────────────────────────── */
const NAV_SECTIONS = [
  {
    label: 'Monitor',
    items: [
      { path: '/',               icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4', label: 'GTSU Overview' },
      { path: '/start-sequence', icon: 'M13 10V3L4 14h7v7l9-11h-7z', label: 'Start Sequence' },
      { path: '/phm',            icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'PHM Dashboard' },
    ],
  },
  {
    label: 'Digital Twin',
    items: [
      { path: '/live-telemetry',  icon: 'M22 12h-4l-3 9L9 3l-3 9H2', label: 'Live Telemetry' },
      { path: '/digital-twin',    icon: 'M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5', label: '3D Digital Twin' },
      { path: '/fault-detection', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z', label: 'Fault Detection' },
      { path: '/physics-model',   icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5', label: 'Physics Model' },
    ],
  },
  {
    label: 'Prognostics',
    items: [
      { path: '/prognostics',    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'RUL & Health' },
      { path: '/maintenance',    icon: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z', label: 'Maintenance' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { path: '/fmea',              icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', label: 'FMEA Analysis' },
      { path: '/fea-analytics',     icon: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16', label: 'FEA / Structural' },
      { path: '/fea-fmea',          icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z', label: 'FEA + FMEA' },
      { path: '/smart-optimization',icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', label: 'Smart Optimization' },
      { path: '/scenario-sim',      icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', label: 'Scenario Simulator' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { path: '/vv-compliance', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'V&V Compliance' },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  '/':                   'GTSU Overview',
  '/start-sequence':     'Start Sequence',
  '/phm':                'PHM Dashboard',
  '/fmea':               'FMEA Analysis',
  '/fea-analytics':      'FEA / Structural',
  '/fea-fmea':           'FEA + FMEA',
  '/smart-optimization': 'Smart Optimization',
  '/vv-compliance':      'V&V Compliance',
  '/live-telemetry':     'Live Telemetry',
  '/digital-twin':       '3D Digital Twin',
  '/fault-detection':    'Fault Detection',
  '/physics-model':      'Physics Model',
  '/prognostics':        'RUL & Health',
  '/maintenance':        'Maintenance',
  '/scenario-sim':       'Scenario Simulator',
  '/profile':            'Profile',
};

const SEARCH_INDEX = [
  /* ── Overview ── */
  { label:'GTSU Overview',         path:'/',            breadcrumb:['Overview'],                          icon:'📊', keywords:'dashboard telemetry jpt ngg p2p1 health rul' },
  { label:'JPT1 Temperature',      path:'/',            breadcrumb:['Overview','KPIs'],                   icon:'🌡', keywords:'jpt1 jet pipe temperature celsius ground limit 900' },
  { label:'NGG Speed',             path:'/',            breadcrumb:['Overview','KPIs'],                   icon:'⚙', keywords:'ngg gas generator speed rpm percent' },
  { label:'P2/P1 Ratio',           path:'/',            breadcrumb:['Overview','KPIs'],                   icon:'📈', keywords:'p2p1 pressure ratio compressor inlet' },
  { label:'Remaining Useful Life', path:'/',            breadcrumb:['Overview','KPIs'],                   icon:'⏱', keywords:'rul remaining useful life hours prediction' },
  { label:'Engine Efficiency',     path:'/',            breadcrumb:['Overview','KPIs'],                   icon:'⚡', keywords:'engine efficiency percent performance' },
  { label:'System Availability',   path:'/',            breadcrumb:['Overview','KPIs'],                   icon:'✅', keywords:'availability uptime system percent' },
  { label:'Compressor Fouling',    path:'/',            breadcrumb:['Overview','Health'],                 icon:'📊', keywords:'fouling compressor index health degradation' },
  { label:'Creep Life',            path:'/',            breadcrumb:['Overview','Health'],                 icon:'📊', keywords:'creep life consumption turbine blade' },
  { label:'Hot Start Risk',        path:'/',            breadcrumb:['Overview','Health'],                 icon:'🔥', keywords:'hot start risk abort hung start sequence' },
  { label:'SECU Status',           path:'/',            breadcrumb:['Overview','System'],                 icon:'🖥', keywords:'secu main backup health digital control unit' },
  { label:'IPS Mode',              path:'/',            breadcrumb:['Overview','System'],                 icon:'🛡', keywords:'ips ignition power supply mode normal emergency' },
  { label:'AI Recommendations',    path:'/',            breadcrumb:['Overview','AI'],                     icon:'🤖', keywords:'ai advisory recommendation action priority' },

  /* ── Start Sequence ── */
  { label:'Start Sequence',        path:'/start-sequence', breadcrumb:['Start Sequence'],               icon:'⚡', keywords:'start sequence ignition light-up ng jpt timeline' },
  { label:'Normal Start',          path:'/start-sequence', breadcrumb:['Start Sequence','Scenarios'],   icon:'⚡', keywords:'normal start scenario ground run standard' },
  { label:'Hot Relight',           path:'/start-sequence', breadcrumb:['Start Sequence','Scenarios'],   icon:'⚡', keywords:'hot relight scenario air start altitude' },
  { label:'Cold Soak Start',       path:'/start-sequence', breadcrumb:['Start Sequence','Scenarios'],   icon:'⚡', keywords:'cold soak low temperature start extreme' },
  { label:'Degraded Start',        path:'/start-sequence', breadcrumb:['Start Sequence','Scenarios'],   icon:'⚡', keywords:'degraded start fouled compressor worn turbine' },
  { label:'Start Timeline Chart',  path:'/start-sequence', breadcrumb:['Start Sequence','Chart'],       icon:'⚡', keywords:'start timeline jpt ngg phases ignition self-sustaining' },
  { label:'Light-Up Detection',    path:'/start-sequence', breadcrumb:['Start Sequence','Phases'],      icon:'⚡', keywords:'light-up detection 135 jpt phase transition' },
  { label:'Self-Sustaining Speed', path:'/start-sequence', breadcrumb:['Start Sequence','Phases'],      icon:'⚡', keywords:'self-sustaining speed ngg 57.4 phase' },

  /* ── PHM ── */
  { label:'PHM Dashboard',         path:'/phm',         breadcrumb:['PHM'],                             icon:'🧠', keywords:'phm prognostics health management prediction' },
  { label:'RUL Prediction',        path:'/phm',         breadcrumb:['PHM','Prognostics'],               icon:'⏱', keywords:'remaining useful life prediction hours degradation trend' },
  { label:'Creep Life Consumption',path:'/phm',         breadcrumb:['PHM','Life Usage'],                icon:'🧠', keywords:'creep life consumption turbine blade thermal cycling' },
  { label:'Thermal Fatigue',       path:'/phm',         breadcrumb:['PHM','Life Usage'],                icon:'🧠', keywords:'thermal fatigue accumulation start-stop cycles' },
  { label:'Compressor Health',     path:'/phm',         breadcrumb:['PHM','Diagnostics'],               icon:'🧠', keywords:'compressor health fouling index washing interval' },
  { label:'Vibration Analysis',    path:'/phm',         breadcrumb:['PHM','Vibration'],                 icon:'📳', keywords:'vibration spectrum fft frequency amplitude bearing' },
  { label:'Maintenance Forecast',  path:'/phm',         breadcrumb:['PHM','Maintenance'],               icon:'🔧', keywords:'maintenance forecast schedule next overhaul interval' },

  /* ── FMEA ── */
  { label:'FMEA Analysis',         path:'/fmea',        breadcrumb:['FMEA'],                            icon:'⚠', keywords:'fmea failure mode effects analysis risk rpn' },
  { label:'RPN Score',             path:'/fmea',        breadcrumb:['FMEA','Risk'],                     icon:'⚠', keywords:'rpn risk priority number severity occurrence detection' },
  { label:'Critical Failure Modes',path:'/fmea',        breadcrumb:['FMEA','Failures'],                 icon:'⚠', keywords:'critical failure compressor blade turbine flameout' },
  { label:'Control Modes',         path:'/fmea',        breadcrumb:['FMEA','Controls'],                 icon:'⚠', keywords:'control mode mitigation action preventive maintenance' },

  /* ── FEA Analytics ── */
  { label:'FEA / Structural',      path:'/fea-analytics', breadcrumb:['FEA Analytics'],                 icon:'🔩', keywords:'fea finite element analysis stress strain structural' },
  { label:'Von Mises Stress',      path:'/fea-analytics', breadcrumb:['FEA Analytics','Stress'],        icon:'🔩', keywords:'von mises stress distribution MPa yield limit' },
  { label:'Thermal Gradient',      path:'/fea-analytics', breadcrumb:['FEA Analytics','Thermal'],       icon:'🔩', keywords:'thermal gradient temperature distribution hotspot' },
  { label:'Design Iterations',     path:'/fea-analytics', breadcrumb:['FEA Analytics','Iterations'],    icon:'🔩', keywords:'design iteration optimization weight stress fatigue' },

  /* ── FEA+FMEA ── */
  { label:'FEA + FMEA Combined',   path:'/fea-fmea',    breadcrumb:['FEA + FMEA'],                     icon:'📋', keywords:'combined fea fmea structural failure correlation' },
  { label:'Component Risk Map',    path:'/fea-fmea',    breadcrumb:['FEA + FMEA','Risk'],               icon:'📋', keywords:'component risk map stress failure mode combined' },

  /* ── Smart Optimization ── */
  { label:'Smart Optimization',    path:'/smart-optimization', breadcrumb:['Smart Optimization'],       icon:'💡', keywords:'optimization advisory simulation before after improvement' },
  { label:'Fuel Consumption',      path:'/smart-optimization', breadcrumb:['Smart Optimization','KPIs'],icon:'💡', keywords:'fuel mass flow consumption efficiency reduction' },
  { label:'Simulation Comparison', path:'/smart-optimization', breadcrumb:['Smart Optimization','Sim'],icon:'💡', keywords:'before after simulation trace comparison improvement' },
  { label:'Advisory Application',  path:'/smart-optimization', breadcrumb:['Smart Optimization','AI'], icon:'💡', keywords:'apply advisory recommendation simulation result' },

  /* ── V&V Compliance ── */
  { label:'V&V Compliance',        path:'/vv-compliance', breadcrumb:['V&V Compliance'],               icon:'🛡', keywords:'verification validation compliance do-178c mil-std iso' },
  { label:'DO-178C',               path:'/vv-compliance', breadcrumb:['V&V Compliance','Standards'],   icon:'🛡', keywords:'do-178c airborne software certification compliance' },
  { label:'MIL-STD-1553B',         path:'/vv-compliance', breadcrumb:['V&V Compliance','Standards'],   icon:'🛡', keywords:'mil-std-1553b bus communication compliance interface' },
  { label:'ISO 23247',             path:'/vv-compliance', breadcrumb:['V&V Compliance','Standards'],   icon:'🛡', keywords:'iso 23247 digital twin manufacturing standard' },
  { label:'Test Coverage',         path:'/vv-compliance', breadcrumb:['V&V Compliance','Testing'],     icon:'🛡', keywords:'test coverage unit integration system acceptance' },

  /* ── Profile ── */
  { label:'Profile',               path:'/profile',     breadcrumb:['Profile'],                         icon:'👤', keywords:'account settings user role preferences' },
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
  const telemetry    = useGTSUStore(s => s.telemetry);
  const health       = useGTSUStore(s => s.health);
  const extSim       = useGTSUStore(s => s.extSim);
  const activeFaults = useGTSUStore(s => s.activeFaults);
  const dataQuality  = useGTSUStore(s => s.dataQuality);
  const [showAlerts,   setShowAlerts]   = useState(false);
  const [showAdvisory, setShowAdvisory] = useState(false);
  const [showProfile,  setShowProfile]  = useState(false);
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
  const hasCritical = activeFaults?.some(f => f.severity === 'critical' && f.status !== 'resolved');
  const hasWarning  = activeFaults?.some(f => f.severity === 'warning'  && f.status !== 'resolved');
  const readiness   = hasCritical ? 'NO-GO' : hasWarning ? 'WATCH' : 'GO';
  const readinessInlineStyle = readiness === 'NO-GO'
    ? { color: 'var(--cwm-danger)', borderColor: 'var(--cwm-danger-border)', background: 'var(--cwm-danger-bg)' }
    : readiness === 'WATCH'
    ? { color: 'var(--cwm-warning)', borderColor: 'var(--cwm-warning-border)', background: 'var(--cwm-warning-bg)' }
    : { color: 'var(--cwm-success)', borderColor: 'var(--cwm-success-border)', background: 'var(--cwm-success-bg)' };
  const phaseLabel = extSim?.isRunning
    ? `SIM – ${extSim.scenario?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—'}`
    : `LIVE – ${telemetry?.startPhase?.toUpperCase() ?? 'STANDBY'}`;
  const secuOk    = telemetry?.secuMainHealthy !== false;
  const dqPct     = typeof dataQuality === 'number' ? dataQuality * 100 : 100;
  const readinessNum = health?.starterReadiness ?? 0;

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
          <main className={`flex-1 ${location.pathname === '/digital-twin' ? 'overflow-hidden' : 'overflow-auto p-4'}`}>
            {children}
          </main>

          {showAlerts && (
            <div className="w-80 shrink-0 overflow-hidden animate-slide-up border-l border-cwm-border" style={{ background: 'var(--cwm-surface)' }}>
              <AlertPanel alerts={alerts} onClose={() => setShowAlerts(false)} onAcknowledge={acknowledgeAlert} />
            </div>
          )}

          {showAdvisory && (
            <div className="cwm-advisory-panel w-96 shrink-0 overflow-hidden animate-slide-up border-l" style={{ borderColor: 'var(--cwm-advisory-border)' }}>
              <AdvisoryPanel advisories={advisories} onClose={() => setShowAdvisory(false)} onAcknowledge={acknowledgeAdvisory} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
