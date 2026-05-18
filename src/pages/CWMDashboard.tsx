import React, { useContext, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataContext } from '../services/socket';
import KPICard, { IcoCoverage, IcoAlert, IcoRoute, IcoTrash, IcoRecycle, IcoBarChart } from '../components/cwm/KPICard';
import CWMKPIDetailModal, { KPIDetailData } from '../components/cwm/KPIDetailModal';
import ZoneFilterBar from '../components/ZoneFilterBar';
import {
  ChartTimeframeControl, TIMEFRAME_OPTIONS, getTimeframeOption,
  buildTimeframeLabels, resampleSeries, CHART_PALETTES,
  getChartTokens, chartTooltip, chartScales, getCSSVar,
} from '../components/chartUtils';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

/* ─── Full-width threshold line plugin for bar charts ─────── */
const fullWidthLinePlugin = {
  id: 'fullWidthLines',
  afterDatasetsDraw(chart: ChartJS) {
    const lines = (chart.options as any).fullWidthLines;
    if (!lines?.length) return;
    const { ctx, chartArea: { left, right }, scales } = chart as any;
    const yScale = scales?.y;
    if (!yScale) return;
    ctx.save();
    lines.forEach(({ value, color, dash, width }: any) => {
      const yPos = yScale.getPixelForValue(value);
      ctx.beginPath();
      ctx.moveTo(left, yPos);
      ctx.lineTo(right, yPos);
      ctx.strokeStyle = color || 'rgba(255,255,255,0.3)';
      ctx.lineWidth = width || 1.5;
      ctx.setLineDash(dash || [4, 3]);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  },
};
ChartJS.register(fullWidthLinePlugin);

/* ─── Zone data ─────────────────────────────────────────────── */
const ZONE_GROUP_MAP: Record<string, string[]> = {
  'Zone 1': ['Z1'], 'Zone 2': ['Z2'], 'Zone 3': ['Z3'], 'Zone 4': ['Z4'], 'Zone 5': ['Z5'],
};

const ZONE_DATA = [
  { zoneId:'Z1', name:'Zone 1 – N. Port',   wards:['Fort','Pettah','Kotahena'],                 avgFillLevel:58.2, status:'normal',    collectedToday:1012, missedCollections:18 },
  { zoneId:'Z2', name:'Zone 2 – Inner N.',   wards:['Maradana','Grandpass','Dematagoda'],        avgFillLevel:63.5, status:'attention', collectedToday:812,  missedCollections:34 },
  { zoneId:'Z3', name:'Zone 3 – Central',    wards:['Slave Island','Borella','Narahenpita'],     avgFillLevel:50.8, status:'normal',    collectedToday:818,  missedCollections:12 },
  { zoneId:'Z4', name:'Zone 4 – W. Coast',   wards:['Kollupitiya','Bambalapitiya','Wellawatta'], avgFillLevel:56.4, status:'normal',    collectedToday:804,  missedCollections:21 },
  { zoneId:'Z5', name:'Zone 5 – Southern',   wards:['Kirulapone','Havelock Town','Rajagiriya'],  avgFillLevel:69.8, status:'attention', collectedToday:984,  missedCollections:38 },
];
const ZONE_TOTAL_PTS = ZONE_DATA.reduce((s, z) => s + z.collectedToday, 0);

const COLLECTION_PROFILE = [18,12,8,5,10,42,78,91,95,89,82,74,61,58,72,88,86,79,62,44,38,31,24,19];
const VEHICLE_ACTIVE_PROFILE  = [8,7,6,5,6,12,22,31,34,32,30,28,24,25,29,33,31,27,19,14,11,10,9,8];
const VEHICLE_ENROUTE_PROFILE = [3,2,2,1,2,5,9,14,16,15,13,11,9,10,12,15,14,11,7,5,4,3,3,2];

function dedupeAlerts(list: any[] = []) {
  const seen = new Set<string>();
  return list.filter((a) => {
    const key = [a.assetId||'',a.category||'',a.title||'',a.message||'',a.zone||''].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeChartDefaults() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: chartTooltip({ titleFont: { size: 11 }, bodyFont: { size: 10 } }) },
    scales: chartScales(),
  };
}

/* ─── ZoneStatusRow ──────────────────────────────────────────── */
function ZoneStatusRow({ zone }: { zone: typeof ZONE_DATA[0] }) {
  const fill = zone.avgFillLevel || 0;
  const fillColor = fill > 85 ? 'bg-red-500' : fill > 65 ? 'bg-yellow-500' : 'bg-emerald-500';
  const total = zone.collectedToday + zone.missedCollections;
  const coverage = total > 0 ? (zone.collectedToday / total * 100).toFixed(1) : '0.0';
  const cov = parseFloat(coverage);
  const covColor = cov >= 95 ? 'text-emerald-400' : cov >= 80 ? 'text-amber-400' : 'text-red-400';
  const statusStyles: Record<string, string> = {
    normal:    'bg-emerald-500/10 text-emerald-400',
    attention: 'bg-yellow-500/10 text-yellow-400',
    critical:  'bg-red-500/10 text-red-400',
  };
  return (
    <div className="px-3 py-2 hover:bg-white/[0.02] rounded border-b border-white/[0.03] last:border-0">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-36 text-xs text-slate-300 font-medium truncate">{zone.name}</div>
        <div className="flex-1">
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${fillColor} transition-all`} style={{ width: `${fill}%` }} />
          </div>
        </div>
        <div className="text-[10px] text-slate-500 w-12 text-right shrink-0">{fill.toFixed(0)}% fill</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${statusStyles[zone.status] || statusStyles.attention}`}>
          {zone.status || 'attention'}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {zone.wards.map(w => (
            <span key={w} className="text-[9px] px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-slate-500">{w}</span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] shrink-0 ml-2">
          <span className={`font-semibold ${covColor}`}>{coverage}% cov.</span>
          <span className="text-slate-500">✓ {zone.collectedToday} pts</span>
          <span className="text-red-500/70">✗ {zone.missedCollections} missed</span>
        </div>
      </div>
    </div>
  );
}

/* ─── GraphInfoPanel (chart detail side panel) ─────────────── */
interface ChartInfo {
  title: string; subtitle?: string; type: string; data: any;
  yMax?: number; yLabel?: string; showLegend?: boolean;
  thresholds?: { normalLine?: number; warningLine?: number; criticalLine?: number; normalDesc?: string; warningDesc?: string; criticalDesc?: string; unit?: string };
  timeframes?: any; selectedTimeframe?: string;
}

function GraphInfoPanel({ chart, onClose }: { chart: ChartInfo; onClose: () => void }) {
  const doughnutTooltip = useMemo(() => ({
    ...chartTooltip(),
    callbacks: {
      label: (ctx: any) => {
        const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
        const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
        return ` ${ctx.label}: ${pct}%`;
      }
    }
  }), []);

  const displayData = useMemo(() => {
    if (!chart || chart.type === 'doughnut' || chart.type === 'bar' || !chart.thresholds) return chart?.data;
    const nLabels = chart.data.labels?.length || 24;
    const extra: any[] = [];
    const t = getChartTokens();
    if (chart.thresholds.normalLine != null) extra.push({ label:'–– Normal', data:Array(nLabels).fill(chart.thresholds.normalLine), borderColor:t.successBar, borderWidth:1.5, borderDash:[6,4], pointRadius:0, fill:false, tension:0, order:10 });
    if (chart.thresholds.warningLine != null) extra.push({ label:'–– Warning', data:Array(nLabels).fill(chart.thresholds.warningLine), borderColor:t.warningBar, borderWidth:1.5, borderDash:[4,3], pointRadius:0, fill:false, tension:0, order:10 });
    if (chart.thresholds.criticalLine != null) extra.push({ label:'–– Critical', data:Array(nLabels).fill(chart.thresholds.criticalLine), borderColor:t.dangerBar, borderWidth:1.5, borderDash:[3,3], pointRadius:0, fill:false, tension:0, order:10 });
    return { ...chart.data, datasets: [...chart.data.datasets, ...extra] };
  }, [chart]);

  const opts = useMemo(() => {
    if (!chart) return {};
    const cd = makeChartDefaults();
    const t = getChartTokens();
    const legendCfg = chart.showLegend ? {
      display: true, position: chart.type === 'doughnut' ? 'right' : 'top',
      labels: { color: t.legendColor, font: { size: 9 }, boxWidth: 8, usePointStyle: true, padding: 6, filter: (item: any) => !item.text.startsWith('––') },
    } : { display: false };
    if (chart.type === 'doughnut') {
      return { responsive: true, maintainAspectRatio: false, plugins: { legend: legendCfg, tooltip: doughnutTooltip }, cutout: '65%' };
    }
    return { ...cd, plugins: { ...cd.plugins, legend: legendCfg },
      ...(chart.type === 'bar' && chart.thresholds ? { fullWidthLines: [
        ...(chart.thresholds.normalLine  != null ? [{ value: chart.thresholds.normalLine,  color: t.successBar, dash: [6,4] }] : []),
        ...(chart.thresholds.warningLine != null ? [{ value: chart.thresholds.warningLine, color: t.warningBar, dash: [4,3] }] : []),
        ...(chart.thresholds.criticalLine != null ? [{ value: chart.thresholds.criticalLine, color: t.dangerBar, dash: [3,3] }] : []),
      ] } : {}),
      scales: { x: { ...cd.scales.x }, y: { ...cd.scales.y, ...(chart.yMax ? { max: chart.yMax } : {}), ...(chart.yLabel ? { title: { display: true, text: chart.yLabel, color: t.tickColor, font: { size: 9 } } } : {}) } },
    };
  }, [chart, doughnutTooltip]);

  if (!chart) return null;
  const ChartComp = chart.type === 'doughnut' ? Doughnut : chart.type === 'bar' ? Bar : Line;
  const LEVEL_COLORS: Record<string, any> = {
    emerald: { box: 'bg-emerald-500/[0.06] border-emerald-500/25', label: 'text-emerald-400', dash: 'border-emerald-500' },
    amber:   { box: 'bg-amber-500/[0.06] border-amber-500/25',     label: 'text-amber-400',   dash: 'border-amber-500'   },
    red:     { box: 'bg-red-500/[0.06] border-red-500/25',         label: 'text-red-400',     dash: 'border-red-500'     },
  };
  const indicators: any[] = [];
  if (chart.thresholds) {
    const { normalLine, warningLine, criticalLine, normalDesc, warningDesc, criticalDesc, unit = '%' } = chart.thresholds;
    if (normalLine != null || normalDesc)    indicators.push({ level:'Normal',   color:'emerald', desc: normalDesc   || `≥ ${normalLine}${unit}` });
    if (warningLine != null || warningDesc)  indicators.push({ level:'Warning',  color:'amber',   desc: warningDesc  || `≥ ${warningLine}${unit}` });
    if (criticalLine != null || criticalDesc) indicators.push({ level:'Critical', color:'red',    desc: criticalDesc || `≥ ${criticalLine}${unit}` });
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-stretch justify-end" onClick={onClose}>
      <div className="relative border-l border-cwm-border w-full max-w-sm flex flex-col shadow-2xl"
        style={{ background: 'var(--cwm-bg)', boxShadow: '-4px 0 32px rgba(0,0,0,0.45)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-cwm-border shrink-0">
          <div>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-0.5">Chart Details</p>
            <h2 className="text-sm font-bold text-white leading-tight">{chart.title}</h2>
          </div>
          <button onClick={onClose} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {chart.subtitle && (
            <div>
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">About This Chart</p>
              <p className="text-xs text-slate-300 leading-relaxed">{chart.subtitle}</p>
            </div>
          )}
          <div>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Chart Preview</p>
            <div className="bg-cwm-panel border border-cwm-border rounded-lg p-3" style={{ height: 220 }}>
              <ChartComp data={chart.type === 'doughnut' ? chart.data : displayData} options={opts as any} />
            </div>
          </div>
          {indicators.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-2">Level Indicators</p>
              <div className="space-y-2">
                {indicators.map(({ level, color, desc }) => {
                  const s = LEVEL_COLORS[color];
                  return (
                    <div key={level} className={`flex items-start gap-3 border rounded-lg p-3 ${s.box}`}>
                      <div className={`w-6 mt-1.5 border-t-2 border-dashed shrink-0 ${s.dash}`} />
                      <div>
                        <span className={`text-[10px] font-bold uppercase ${s.label}`}>{level}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── MiniChart ──────────────────────────────────────────────── */
interface MiniChartProps {
  title: string; subtitle?: string;
  type: 'line' | 'doughnut' | 'bar';
  data: any; height?: number; showLegend?: boolean;
  yMax?: number; yLabel?: string;
  thresholds?: ChartInfo['thresholds'];
  onInfo?: (info: ChartInfo) => void;
  timeframes?: any[]; defaultTimeframe?: string;
}

function MiniChart({ title, subtitle, type, data, height = 120, showLegend = false, yMax, yLabel, thresholds, onInfo, timeframes, defaultTimeframe }: MiniChartProps) {
  const ChartComp = type === 'doughnut' ? Doughnut : type === 'bar' ? Bar : Line;
  const [selectedTimeframe, setSelectedTimeframe] = useState(defaultTimeframe || timeframes?.[0]?.value);
  const activeFrame = timeframes ? getTimeframeOption(timeframes, selectedTimeframe!) : null;

  const displayData = useMemo(() => {
    if (!activeFrame || type === 'doughnut') return data;
    return {
      labels: buildTimeframeLabels(activeFrame.value, activeFrame.points),
      datasets: data.datasets.map((ds: any) => ({
        ...ds,
        data: resampleSeries(
          activeFrame.dataWindow ? ds.data.slice(-activeFrame.dataWindow) : ds.data,
          activeFrame.points
        ),
      })),
    };
  }, [activeFrame, data, type]);

  const chartDataWithThresholds = useMemo(() => {
    if (type === 'doughnut' || type === 'bar' || !thresholds) return displayData;
    const nLabels = displayData.labels?.length || 24;
    const extra: any[] = [];
    const t = getChartTokens();
    if (thresholds.normalLine  != null) extra.push({ label:'–– Normal', data:Array(nLabels).fill(thresholds.normalLine),  borderColor:t.successBar, borderWidth:1.5, borderDash:[6,4], pointRadius:0, fill:false, tension:0, order:10 });
    if (thresholds.warningLine != null) extra.push({ label:'–– Warning', data:Array(nLabels).fill(thresholds.warningLine), borderColor:t.warningBar, borderWidth:1.5, borderDash:[4,3], pointRadius:0, fill:false, tension:0, order:10 });
    if (thresholds.criticalLine!= null) extra.push({ label:'–– Critical', data:Array(nLabels).fill(thresholds.criticalLine),borderColor:t.dangerBar,  borderWidth:1.5, borderDash:[3,3], pointRadius:0, fill:false, tension:0, order:10 });
    return { ...displayData, datasets: [...displayData.datasets, ...extra] };
  }, [displayData, type, thresholds]);

  const t = getChartTokens();
  const legendCfg = showLegend ? {
    display: true, position: type === 'doughnut' ? 'right' : 'top',
    labels: { color: t.legendColor, font: { size: 8 }, boxWidth: 8, usePointStyle: true, padding: 4, filter: (item: any) => !item.text.startsWith('––') },
  } : { display: false };

  const doughnutTooltip = {
    ...chartTooltip(),
    callbacks: { label: (ctx: any) => { const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0); const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0'; return ` ${ctx.label}: ${pct}%`; } }
  };

  const cd = makeChartDefaults();
  const opts = type === 'doughnut' ? {
    responsive: true, maintainAspectRatio: false, plugins: { legend: legendCfg, tooltip: doughnutTooltip }, cutout: '65%',
  } : {
    ...cd, plugins: { ...cd.plugins, legend: legendCfg },
    ...(type === 'bar' && thresholds ? { fullWidthLines: [
      ...(thresholds.normalLine  != null ? [{ value: thresholds.normalLine,  color: t.successBar, dash: [6,4] }] : []),
      ...(thresholds.warningLine != null ? [{ value: thresholds.warningLine, color: t.warningBar, dash: [4,3] }] : []),
      ...(thresholds.criticalLine!= null ? [{ value: thresholds.criticalLine,color: t.dangerBar,  dash: [3,3] }] : []),
    ] } : {}),
    scales: {
      x: { ...cd.scales.x },
      y: { ...cd.scales.y, ...(yMax ? { max: yMax } : {}), ...(yLabel ? { title: { display: true, text: yLabel, color: getCSSVar('--cwm-text-faint'), font: { size: 8 } } } : {}) },
    },
  };

  return (
    <div className="bg-cwm-panel border border-cwm-border rounded-lg p-3 relative">
      <div className="flex items-center gap-1 mb-0.5">
        <h4 className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex-1">{title}</h4>
        <ChartTimeframeControl options={timeframes || []} value={activeFrame?.value} onChange={setSelectedTimeframe} />
        <button
          onClick={() => onInfo && onInfo({ title, subtitle, type, data: displayData, yMax, yLabel, showLegend, thresholds, timeframes, selectedTimeframe: activeFrame?.value })}
          className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 flex items-center justify-center text-[9px] transition-colors shrink-0"
          title="Open chart details panel"
        >ℹ</button>
      </div>
      {subtitle && <p className="text-[9px] text-slate-400 mt-0 mb-2 leading-snug">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      <div style={{ height }}>
        <ChartComp data={type === 'doughnut' ? displayData : chartDataWithThresholds} options={opts as any} />
      </div>
    </div>
  );
}

/* ─── Digital Twin Preview ───────────────────────────────────── */
function DigitalTwinPreview() {
  const navigate = useNavigate();
  return (
    <div className="bg-cwm-panel border border-cwm-border rounded-xl overflow-hidden flex flex-col" style={{ height: 400 }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-cwm-border shrink-0">
        <div className="flex items-center space-x-3">
          <h3 className="text-sm font-bold text-white">Digital Twin – Live SWM Network</h3>
          <span className="flex items-center space-x-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400">Real-time</span>
          </span>
        </div>
        <button onClick={() => navigate('/digital-twin')} className="cwm-btn px-3 py-1.5 text-[10px] font-medium">
          Open Full Map →
        </button>
      </div>
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-4">
        <svg viewBox="0 0 500 300" className="w-full h-full" style={{ maxHeight: 300 }}>
          <rect width="500" height="300" fill="var(--cwm-surface-soft)" rx="8"/>
          {[
            { cx:120, cy:80,  r:55, fill:'#16a34a33', stroke:'#16a34a', label:'Z1 – N.Port',   fill_pct:58 },
            { cx:210, cy:120, r:50, fill:'#d9770633', stroke:'#d97706', label:'Z2 – Inner N.',  fill_pct:64 },
            { cx:250, cy:190, r:48, fill:'#16a34a33', stroke:'#16a34a', label:'Z3 – Central',   fill_pct:51 },
            { cx:360, cy:100, r:50, fill:'#16a34a33', stroke:'#16a34a', label:'Z4 – W.Coast',   fill_pct:56 },
            { cx:380, cy:220, r:52, fill:'#d9770633', stroke:'#d97706', label:'Z5 – Southern',  fill_pct:70 },
          ].map(z => (
            <g key={z.label}>
              <circle cx={z.cx} cy={z.cy} r={z.r} fill={z.fill} stroke={z.stroke} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8"/>
              <text x={z.cx} y={z.cy - 6} textAnchor="middle" fill="var(--cwm-text)" fontSize="9" fontWeight="600">{z.label}</text>
              <text x={z.cx} y={z.cy + 8} textAnchor="middle" fill={z.stroke} fontSize="10" fontWeight="700">{z.fill_pct}% fill</text>
              <circle cx={z.cx + z.r * 0.3} cy={z.cy - z.r * 0.4} r="3.5" fill="var(--cwm-accent)" opacity="0.85">
                <animate attributeName="r" values="3.5;5;3.5" dur="2s" repeatCount="indefinite"/>
              </circle>
            </g>
          ))}
          {[
            { x:60,  y:250, label:'WTE Plant',     color:'#f59e0b' },
            { x:260, y:260, label:'Kerawala. TS',   color:'#3b82f6' },
            { x:450, y:260, label:'Kolonnawa MRF',  color:'#10b981' },
          ].map(f => (
            <g key={f.label}>
              <rect x={f.x - 28} y={f.y - 10} width="56" height="22" rx="4" fill={f.color + '22'} stroke={f.color} strokeWidth="1"/>
              <text x={f.x} y={f.y + 4} textAnchor="middle" fill={f.color} fontSize="8" fontWeight="600">{f.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const ctx = useContext(DataContext);
  const { kpis: rawKpis, alerts: rawAlerts } = ctx || {};
  const k = useMemo(() => rawKpis || {}, [rawKpis]);
  const bins = (rawKpis as any)?.binsSummary || {};
  const [selectedKPIDetail, setSelectedKPIDetail] = useState<KPIDetailData | null>(null);
  const [selectedChartInfo, setSelectedChartInfo] = useState<ChartInfo | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>('all');

  const filteredZones = useMemo(() => {
    if (zoneFilter === 'all') return ZONE_DATA;
    const targetId = ZONE_GROUP_MAP[zoneFilter]?.[0];
    return ZONE_DATA.filter(z => z.zoneId === targetId);
  }, [zoneFilter]);

  const filteredAlerts = useMemo(() => {
    const unique = dedupeAlerts(rawAlerts || []);
    if (zoneFilter === 'all') return unique;
    const ids = ZONE_GROUP_MAP[zoneFilter] || [];
    return unique.filter((a: any) => !a.zone || ids.includes(a.zone));
  }, [rawAlerts, zoneFilter]);

  const zoneKPIs = useMemo(() => {
    if (zoneFilter === 'all') return null;
    const zone = filteredZones[0];
    if (!zone) return null;
    const totalPts = zone.collectedToday + zone.missedCollections;
    const coverage  = +(zone.collectedToday / totalPts * 100).toFixed(1);
    const missedPct = +(zone.missedCollections / totalPts * 100).toFixed(1);
    const zoneTons  = Math.round((zone.collectedToday / ZONE_TOTAL_PTS) * ((k as any).dailyCollectionTons || 1247));
    return {
      ...(k as any),
      collectionCoverage: coverage, coverageTrend: +(coverage - ((k as any).collectionCoverage || 89.4)).toFixed(1),
      missedCollections: missedPct, missedTrend: +(missedPct - ((k as any).missedCollections || 9.9)).toFixed(1),
      missedPoints: zone.missedCollections,
      overdueAlerts: filteredAlerts.filter((a: any) => a.status === 'active' || a.status === 'critical').length,
      dailyCollectionTons: zoneTons, collectionRate: coverage,
      zonesServed: 1, wardCount: zone.wards.length, avgFillLevel: zone.avgFillLevel,
    };
  }, [zoneFilter, filteredZones, filteredAlerts, k]);

  const kz = zoneKPIs || (k as any);

  const showKPIDetail = (data: KPIDetailData) =>
    setSelectedKPIDetail(zoneFilter === 'all' ? data : { ...data, analysis: undefined });

  const collectionTrendData = useMemo(() => {
    const scale = zoneKPIs ? (zoneKPIs.collectionCoverage / ((k as any).collectionCoverage || 89.4)) : 1;
    return {
      labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`),
      datasets: [{ label:'Collection Rate %', data: COLLECTION_PROFILE.map(v => Math.min(100, Math.round(v * scale))), borderColor: getCSSVar('--cwm-info'), backgroundColor: getCSSVar('--cwm-accent-bg'), fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 }]
    };
  }, [(k as any).collectionCoverage, zoneKPIs]); // eslint-disable-line react-hooks/exhaustive-deps

  const wasteCompositionData = useMemo(() => ({
    labels: ['Organic', 'Plastic', 'Paper', 'Glass', 'Metal', 'Hazardous', 'Other'],
    datasets: [{ data: (k as any).composition || [62,12,9,6,3,2,6], backgroundColor: CHART_PALETTES.categorical.slice(0, 7), borderWidth: 0 }]
  }), [(k as any).composition]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoneComparisonData = useMemo(() => {
    const zones = zoneFilter === 'all' ? ZONE_DATA : filteredZones;
    const t = getChartTokens();
    return {
      labels: zones.map(z => z.name.split('–').pop()?.trim().split(' ').slice(0, 2).join(' ')),
      datasets: [{ label:'Fill Level %', data: zones.map(z => z.avgFillLevel), backgroundColor: zones.map(z => z.avgFillLevel > 75 ? t.dangerBar : z.avgFillLevel > 60 ? t.warningBar : t.accentBg), borderRadius: 4 }]
    };
  }, [zoneFilter, filteredZones]);

  const vehicleActivityData = useMemo(() => ({
    labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`),
    datasets: [
      { label:'Collecting', data: VEHICLE_ACTIVE_PROFILE,  borderColor: CHART_PALETTES.area.blue.border,   backgroundColor: CHART_PALETTES.area.blue.fill,   fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
      { label:'Returning',  data: VEHICLE_ENROUTE_PROFILE, borderColor: CHART_PALETTES.area.violet.border, backgroundColor: CHART_PALETTES.area.violet.fill, fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
    ]
  }), []);

  const col1 = (kz.collectionCoverage || 90.1) >= 95 ? 'text-emerald-400' : (kz.collectionCoverage || 90.1) >= 85 ? 'text-amber-400' : 'text-red-400';
  const col2 = (kz.missedCollections || 9.9) <= 2 ? 'text-emerald-400' : (kz.missedCollections || 9.9) <= 5 ? 'text-amber-400' : 'text-red-400';
  const col3 = ((k as any).routeSavings || 18.4) >= 20 ? 'text-emerald-400' : 'text-amber-400';
  const col4 = (kz.collectionRate || 89.4) >= 95 ? 'text-emerald-400' : (kz.collectionRate || 89.4) >= 80 ? 'text-amber-400' : 'text-red-400';
  const col5 = ((k as any).recyclingRate || 23.0) >= 30 ? 'text-emerald-400' : 'text-amber-400';
  const col6 = (bins.overflowPct || 1.8) <= 2 ? 'text-emerald-400' : 'text-red-400';

  return (
    <>
      {selectedKPIDetail && <CWMKPIDetailModal kpi={selectedKPIDetail} onClose={() => setSelectedKPIDetail(null)} showAnalysis={zoneFilter === 'all'} />}
      {selectedChartInfo && <GraphInfoPanel chart={selectedChartInfo} onClose={() => setSelectedChartInfo(null)} />}

      <div className="h-full overflow-y-auto p-4 space-y-4">
        {/* Page header with zone filter */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-lg font-bold text-white tracking-tight">GTSU Operations Dashboard</h1>
          <ZoneFilterBar value={zoneFilter} onChange={setZoneFilter} />
        </div>

        {/* Zone scope banner */}
        {zoneFilter !== 'all' && filteredZones.length > 0 && (() => {
          const zone = filteredZones[0];
          const sc: Record<string, string> = {
            normal:    'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
            attention: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
            critical:  'text-red-400 bg-red-500/10 border-red-500/30',
          };
          return (
            <div className="flex items-center gap-3 bg-cwm-panel border border-cwm-border rounded-lg px-4 py-2 flex-wrap">
              <span className="text-xs font-semibold text-white">{zone.name}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${sc[zone.status] || sc.attention}`}>
                {(zone.status || 'attention').toUpperCase()}
              </span>
              <span className="text-[11px] text-slate-400">
                Wards: <span className="text-slate-300">{zone.wards?.join(' · ')}</span>
              </span>
              <span className="ml-auto text-[10px] text-slate-600 italic hidden md:block">Zone-scoped — KPIs and alerts reflect this zone only</span>
            </div>
          );
        })()}

        {/* KPI Strip — 6 cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <KPICard icon={<IcoCoverage />} label="Collection Coverage" value={`${(kz.collectionCoverage || 90.1).toFixed(1)}%`}
            trend={kz.coverageTrend || -1.2} color={col1}
            subValues={[{ label:'Missed', value:`${(kz.missedCollections || 9.9).toFixed(1)}%` }, { label: zoneFilter === 'all' ? 'Zones' : 'Wards', value: zoneFilter === 'all' ? `${kz.zonesServed || 5}/5` : `${kz.wardCount || 3} wards` }]}
            onClick={() => showKPIDetail({ icon:<IcoCoverage />, label:'Collection Coverage', value:(kz.collectionCoverage || 90.1).toFixed(1), unit:'%', trend:kz.coverageTrend || -1.2, color:col1, thresholds:{ green:95, amber:85 }, inverted:false, definition:'Percentage of scheduled door-to-door collection points attended today. Measured via RFID scan logs and GPS route confirmation across all 15 wards in Colombo Municipal Council.', subValues:[{ label:'Points Collected', value:kz.collectedPoints||'4,162' },{ label:'Missed Points', value:kz.missedPoints||457 },{ label:'Critical Wards', value:kz.criticalWards||3 },{ label:'Target', value:'≥95% daily' }], analysis:'Coverage is 4.9pts below the 95% SLA — 3 wards are in active breach: Grandpass (53.2%), Kirulapone (80.4%), Rajagiriya (82.5%)|V-006 breakdown at 08:15 is the root cause for Grandpass; driver absence for Kirulapone; route skipping for Rajagiriya|Deploy standby vehicles to Grandpass Zone 2 immediately — 125 points are recoverable before shift end at 15:00', target:'95%+ daily door-to-door coverage' })} />

          <KPICard icon={<IcoAlert />} label="Missed Collections" value={`${(kz.missedCollections || 9.9).toFixed(1)}%`}
            trend={-(kz.missedTrend || 0.4)} color={col2}
            subValues={[{ label:'Points', value:kz.missedPoints||457 },{ label:'Alerts', value:kz.overdueAlerts||8 }]}
            onClick={() => showKPIDetail({ icon:<IcoAlert />, label:'Missed Collections', value:(kz.missedCollections || 9.9).toFixed(1), unit:'%', trend:-(kz.missedTrend||0.4), color:col2, thresholds:{ green:2, amber:5 }, inverted:true, definition:'Percentage of scheduled collection points not attended within the planned time window. Tracked via RFID non-scan events and GPS geo-fence miss analysis per ward.', subValues:[{ label:'Missed Points', value:kz.missedPoints||457 },{ label:'Overdue Alerts', value:kz.overdueAlerts||8 },{ label:'Avg Delay', value:'42 min' },{ label:'Auto-Dispatched', value:'8 vehicles' }], analysis:'Three separate failure modes are driving today\'s misses: mechanical breakdown (V-006, 125 pts in Grandpass), driver absence (76 pts in Kirulapone), route skip (27 pts in Wellawatta)|8 overdue alerts are live; each escalates to a formal citizen complaint within 4 hours if unresolved|Assign standby vehicle to Grandpass, confirm roster cover for Kirulapone, and issue a supervisor accountability report for the Wellawatta route skip', target:'<2% per ward per day' })} />

          <KPICard icon={<IcoRoute />} label="Route Savings" value={`${((k as any).routeSavings || 18.4).toFixed(1)}%`}
            trend={(k as any).routeTrend || 2.3} color={col3}
            subValues={[{ label:'Fuel', value:`Rs.${((k as any).fuelSaved || 42).toFixed(0)}k` },{ label:'km saved', value:(k as any).kmSaved||312 }]}
            onClick={() => showKPIDetail({ icon:<IcoRoute />, label:'Route Optimisation Savings', value:((k as any).routeSavings || 18.4).toFixed(1), unit:'%', trend:(k as any).routeTrend||2.3, color:col3, thresholds:{ green:20, amber:10 }, inverted:false, definition:'Reduction in total route distance and fuel cost compared to unoptimised baseline routes. Calculated using GPS trip logs vs pre-defined optimal paths.', subValues:[{ label:'Fuel Saved', value:`Rs.${((k as any).fuelSaved||42).toFixed(0)}k` },{ label:'KM Reduced', value:`${(k as any).kmSaved||312} km` },{ label:'Time Saved', value:'3.2 hrs' },{ label:'CO₂ Avoided', value:'334 kg' }], analysis:'Savings are 1.6pts short of the 20% target — the gap is recoverable this afternoon without additional vehicles|Zone 2 underperformed because breakdowns reduced load per trip, inflating cost-per-tonne|Apply optimised routing to V-010\'s Zone 2 afternoon run — estimated +0.4% savings, enough to bring the daily total to target', target:'20% fuel/trip time reduction vs baseline' })} />

          <KPICard icon={<IcoTrash />} label="Daily Collection" value={(kz.dailyCollectionTons ?? 1247).toFixed(0)}
            unit="t/day" trend={kz.collectionTrend || 3.2} color={col4}
            subValues={[{ label:'Target', value:zoneFilter==='all'?'1,400t':`${Math.round((kz.dailyCollectionTons||249)/((k as any).dailyCollectionTons||1247)*1400)}t` },{ label:'Rate', value:`${(kz.collectionRate||72).toFixed(0)}%` }]}
            onClick={() => showKPIDetail({ icon:<IcoTrash />, label:'Total Waste Collected', value:(kz.dailyCollectionTons??1247).toFixed(0), unit:'t/day', trend:kz.collectionTrend||3.2, color:col4, thresholds:{ green:1200, amber:900 }, inverted:false, definition:'Total tonnage of municipal solid waste collected daily across all wards, measured via weighbridge at transfer stations and WTE plant intake.', subValues:[{ label:'Target', value:zoneFilter==='all'?'1,400 t/day':`${Math.round((kz.dailyCollectionTons||249)/((k as any).dailyCollectionTons||1247)*1400)} t/day` },{ label:'Collection Rate', value:`${(kz.collectionRate||72).toFixed(0)}%` },{ label:'Weighbridge Reads', value:'138' },{ label:'By Vehicle', value:'27.5t avg' }], analysis:'153t short of target — V-006 breakdown and V-014 idle removed ~8% of morning fleet capacity|60–80t is reachable this afternoon by prioritising Grandpass and Pettah, both high-density wards with reserve vehicles|Kerawalapitiya TS is logging 18-min processing delays — if afternoon inflow rises above 110t/h, a throughput backlog will form before 18:00', target:'1,400 tonnes/day total' })} />

          <KPICard icon={<IcoRecycle />} label="Recycling Rate" value={`${((k as any).recyclingRate || 23.0).toFixed(1)}%`}
            trend={(k as any).recyclingTrend || 1.8} color={col5}
            subValues={[{ label:'Material', value:'287t' },{ label:'Revenue', value:'Rs.2.1M' }]}
            onClick={() => showKPIDetail({ icon:<IcoRecycle />, label:'Recycling / Reuse Rate', value:((k as any).recyclingRate||23.0).toFixed(1), unit:'%', trend:(k as any).recyclingTrend||1.8, color:col5, thresholds:{ green:30, amber:15 }, inverted:false, definition:'Percentage of collected waste diverted from landfill through recycling, composting or reuse. Target of 30-50% supports SDG 12.', subValues:[{ label:'Recyclables', value:'287t' },{ label:'Composted', value:'94t' },{ label:'Revenue', value:'Rs.2.1M' },{ label:'Diverted', value:'381t' }], analysis:'Capacity to hit 30% already exists today — Muthurajawela Compost (91.2% recovery) has headroom and Kolonnawa MRF can absorb 30t/day more|Kolonnawa MRF is rejecting 30.7t/day (21.7% of intake) due to contaminated mixed loads|Redirect 30t/day of source-separated organics from Kerawalapitiya TS to Muthurajawela; this single change lifts the recycling rate from 23.4% to approximately 26%', target:'30-50% diversion from landfill' })} />

          <KPICard icon={<IcoBarChart />} label="Overflow Incidents" value={`${(bins.overflowPct || 1.8).toFixed(1)}%`}
            trend={-((k as any).overflowTrend || 0.3)} color={col6}
            subValues={[{ label:'Bins', value:`${bins.overflow||8}/${bins.total||445}` },{ label:'Alerts', value:bins.alerts||8 }]}
            onClick={() => showKPIDetail({ icon:<IcoBarChart />, label:'Bin Overflow Incidents', value:(bins.overflowPct||1.8).toFixed(1), unit:'%', trend:-((k as any).overflowTrend||0.3), color:col6, thresholds:{ green:2, amber:5 }, inverted:true, definition:'Percentage of smart bins reporting fill level above 85% (overflow threshold). Detected by ultrasonic sensors. Target is <2% bins in overflow state at any time.', subValues:[{ label:'Overflowing Bins', value:`${bins.overflow||8} bins` },{ label:'Total Monitored', value:bins.total||445 },{ label:'75%+ Threshold', value:bins.needsCollection||31 },{ label:'Sensor Uptime', value:'99.1%' }], analysis:'All 8 overflowing bins are in Pettah Zone 1 — Wednesday Manning Market traffic runs 22% above the weekly average, making this a predictable weekly pattern|Sensors are at 99.1% uptime and auto-alerts fired within 3 minutes of each breach; the detection pipeline is working — the gap is pre-emption|Pre-scheduling a Wednesday afternoon Pettah pass (Rs.4,200) costs less than a single overflow complaint resolution (Rs.18,000 average)', target:'<2% bins in overflow at any time' })} />
        </div>

        {/* Digital Twin + 2 side charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-2.5">
          <div className="lg:col-span-3">
            <DigitalTwinPreview />
          </div>
          <div className="lg:col-span-2 flex flex-col gap-2.5">
            <MiniChart
              title="Collection Trend"
              subtitle="Hourly collection rate — % of scheduled stops completed per hour. Highlights shift gaps and peak demand windows."
              type="line" data={collectionTrendData} height={155} yMax={100} yLabel="Collection %"
              timeframes={TIMEFRAME_OPTIONS.intradayOps} defaultTimeframe="24H"
              thresholds={{ normalLine:80, warningLine:60, normalDesc:'≥ 80% — on target', warningDesc:'60–80% — below target', criticalDesc:'< 60% — escalate now', unit:'%' }}
              onInfo={setSelectedChartInfo} />
            <MiniChart
              title="Waste Composition"
              subtitle="Material breakdown of today's collected waste by weight %. Guides MRF sorting priorities and recycling revenue targets."
              type="doughnut" data={wasteCompositionData} height={155} showLegend
              thresholds={{ normalDesc:'Organics 55–65% → optimal compost yield', warningDesc:'Plastics >15% → MRF contamination risk', criticalDesc:'Hazardous >3% → compliance alert triggered', unit:'' }}
              onInfo={setSelectedChartInfo} />
          </div>
        </div>

        {/* Zone Fill + Vehicle Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <MiniChart
            title="Zone Fill Levels"
            subtitle="Avg smart-bin fill level per zone. Red bars exceed 75% — those zones need priority dispatch to prevent overflow."
            type="bar" data={zoneComparisonData} height={140} yMax={100} yLabel="Fill Level %"
            thresholds={{ warningLine:65, criticalLine:85, normalDesc:'< 65% — capacity safe', warningDesc:'65–85% — schedule soon', criticalDesc:'> 85% — overflow risk, dispatch now', unit:'%' }}
            onInfo={setSelectedChartInfo} />
          <MiniChart
            title="Vehicle Activity"
            subtitle="Collecting vs returning vehicles. Peaks at 08–10 and 14–16 are morning and afternoon collection shifts."
            type="line" data={vehicleActivityData} height={140} showLegend yLabel="Vehicles"
            timeframes={TIMEFRAME_OPTIONS.intradayOps} defaultTimeframe="24H"
            thresholds={{ normalLine:25, warningLine:15, normalDesc:'> 25 active — full fleet', warningDesc:'15–25 — reduced capacity', criticalDesc:'< 15 — critical shortage', unit:' vehicles' }}
            onInfo={setSelectedChartInfo} />
        </div>

        {/* Zone Table + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
          <div className="lg:col-span-2 bg-cwm-panel border border-cwm-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-cwm-border flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white">Zone Performance</h3>
              <span className="text-[10px] text-slate-500">Today</span>
            </div>
            <div className="py-1 max-h-72 overflow-y-auto">
              {filteredZones.map((zone, i) => (
                <ZoneStatusRow key={zone.zoneId || i} zone={zone} />
              ))}
              {filteredZones.length === 0 && (
                <div className="text-center text-slate-600 text-xs py-6">No zone data for selected filter</div>
              )}
            </div>
          </div>

          <div className="bg-cwm-panel border border-cwm-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-cwm-border">
              <h3 className="text-xs font-semibold text-white">Activity Feed</h3>
            </div>
            <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
              {filteredAlerts.slice(0, 10).map((alert: any, i: number) => {
                const isCrit = alert.type === 'critical';
                const isWarn = alert.type === 'warning';
                return (
                  <div key={alert.alertId || i} className={`rounded-xl border p-3 ${isCrit ? 'bg-red-500/[0.06] border-red-500/20' : isWarn ? 'bg-amber-500/[0.06] border-amber-500/20' : 'bg-blue-500/[0.04] border-blue-500/15'}`}>
                    <div className="flex items-start space-x-2">
                      <span className={`text-sm mt-0.5 flex-shrink-0 ${isCrit ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-blue-400'}`}>
                        {isCrit ? '⊘' : isWarn ? '⚠' : 'ℹ'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-0.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isCrit ? 'bg-red-500/10 text-red-400 border-red-500/25' : isWarn ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                            {(alert.type || 'info').toUpperCase()}
                          </span>
                          <span className="text-[9px] text-slate-600">
                            {new Date(alert.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-200 font-medium leading-snug">{alert.title}</p>
                        {alert.message && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{alert.message}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredAlerts.length === 0 && (
                <div className="text-center text-slate-600 text-xs py-4">
                  {zoneFilter === 'all' ? 'No recent activity' : 'No alerts for this zone'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
