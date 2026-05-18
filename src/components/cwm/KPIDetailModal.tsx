import React, { useState, useMemo } from 'react';
import { deriveRag } from './KPICard';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Filler, Legend,
} from 'chart.js';
import { CHART_PALETTES, getChartTokens, chartTooltip, chartScales, getCSSVar } from '../chartUtils';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, Legend);

/* ─── RAG Helper ──────────────────────────────────────────── */
function getRag(value: number, thresholds?: { green: number; amber: number }, inverted?: boolean, forceLevel?: string) {
  let level = forceLevel || 'normal';
  if (!forceLevel) {
    if (thresholds) {
      const { green, amber } = thresholds;
      if (!inverted) level = value >= green ? 'normal' : value >= amber ? 'warning' : 'critical';
      else           level = value <= green ? 'normal' : value <= amber ? 'warning' : 'critical';
    } else {
      level = value >= 80 ? 'normal' : value >= 50 ? 'warning' : 'critical';
    }
  }
  const map: Record<string, { color: string; text: string; dot: string; label: string; solidBg: string; solidBorder: string; badgeSolidBg: string; badgeSolidBorder: string }> = {
    normal: {
      color: getCSSVar('--cwm-success'), text: 'text-emerald-400',
      dot: 'bg-emerald-400', label: 'NORMAL',
      solidBg: 'var(--cwm-modal-success-bg)', solidBorder: 'var(--cwm-modal-success-border)',
      badgeSolidBg: 'var(--cwm-modal-success-bg)', badgeSolidBorder: 'var(--cwm-modal-success-border)',
    },
    warning: {
      color: getCSSVar('--cwm-warning'), text: 'text-amber-400',
      dot: 'bg-amber-400', label: 'WARNING',
      solidBg: 'var(--cwm-modal-warning-bg)', solidBorder: 'var(--cwm-modal-warning-border)',
      badgeSolidBg: 'var(--cwm-modal-warning-bg)', badgeSolidBorder: 'var(--cwm-modal-warning-border)',
    },
    critical: {
      color: getCSSVar('--cwm-danger'), text: 'text-red-400',
      dot: 'bg-red-400', label: 'CRITICAL',
      solidBg: 'var(--cwm-modal-danger-bg)', solidBorder: 'var(--cwm-modal-danger-border)',
      badgeSolidBg: 'var(--cwm-modal-danger-bg)', badgeSolidBorder: 'var(--cwm-modal-danger-border)',
    },
  };
  return map[level] || map.normal;
}

/* ─── Deterministic series generators ────────────────────── */
function buildHist(numValue: number, trendPct: number, n: number): number[] {
  const v0 = numValue || 50;
  const slope = (trendPct || 0) / 100 * v0 / n;
  return Array.from({ length: n }, (_, i) => {
    const v = v0 - slope * (n - i)
      + Math.sin(i * 0.8)       * v0 * 0.03
      + Math.sin(i * 0.3 + 1.2) * v0 * 0.015;
    return Math.max(0, parseFloat(v.toFixed(2)));
  });
}

function buildPred(hist: number[], trendPct: number, n = 8): number[] {
  const last = hist[hist.length - 1] || 50;
  const avg  = hist.reduce((a, b) => a + b, 0) / hist.length;
  const slope = (trendPct || 0) / 100 * avg / hist.length;
  return Array.from({ length: n }, (_, i) => {
    const v = last + slope * (i + 1) * 2 + Math.sin(i * 0.6) * avg * 0.02;
    return Math.max(0, parseFloat(v.toFixed(2)));
  });
}

/* ─── Time-range config ─────────────────────────────────── */
type TimeRangeKey = '12H' | '24H' | '7D' | '30D';
const TIME_CFG: Record<TimeRangeKey, { n: number; lbl: (i: number) => string; title: string }> = {
  '12H': { n: 12, lbl: (i) => `${String(i).padStart(2,'0')}:00`, title: '12-Hour (1-Hr Intervals)' },
  '24H': { n: 24, lbl: (i) => `${String(i).padStart(2,'0')}:00`, title: '24-Hour (1-Hr Intervals)' },
  '7D':  { n: 7,  lbl: (i) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i % 7], title: '7-Day (Daily Intervals)' },
  '30D': { n: 30, lbl: (i) => `D${i + 1}`,                       title: '30-Day (Daily Intervals)' },
};

function getKpiTimeRanges(kpi: KPIDetailData): TimeRangeKey[] {
  const label = (kpi?.label || '').toLowerCase();
  const unit  = (kpi?.unit  || '').toLowerCase();
  if (label.includes('carbon') || label.includes('co2') || label.includes('co₂') ||
      label.includes('circular') || label.includes('landfill capacity') ||
      label.includes('esg') || unit.includes('/100')) {
    return ['7D', '30D'];
  }
  if (label.includes('daily') || label.includes('ton') || label.includes('throughput') ||
      label.includes('intake') || label.includes('scheduled') || label.includes('collected') ||
      label.includes('recycling') || label.includes('citizen')) {
    return ['24H', '7D', '30D'];
  }
  if (label.includes('coverage') || label.includes('missed') || label.includes('overflow') ||
      label.includes('route') || label.includes('vehicle') || label.includes('idle') ||
      label.includes('fuel') || label.includes('power') || label.includes('temperature') ||
      label.includes('emission')) {
    return ['12H', '24H', '7D'];
  }
  return ['24H', '7D', '30D'];
}

/* ─── Threshold side-label plugin ─────────────────────────── */
function makePlugin(target: number, warn: number | null) {
  return {
    id: 'threshLineLabels',
    afterDraw(chart: ChartJS) {
      const { ctx, chartArea, scales } = chart as any;
      if (!chartArea || !scales?.y) return;
      const { right } = chartArea;
      const { y } = scales;
      ctx.save();
      ctx.font = '9px Inter,system-ui,sans-serif';
      ctx.textAlign = 'left';
      const draw = (val: number | null, color: string, text: string) => {
        if (val == null || isNaN(val) || val < y.min || val > y.max) return;
        ctx.fillStyle = color;
        ctx.fillText(text, right + 4, y.getPixelForValue(val) + 3);
      };
      draw(target, getCSSVar('--cwm-text-faint'), 'Target');
      draw(warn,   getCSSVar('--cwm-violet'),     'Warn');
      ctx.restore();
    },
  };
}

/* ─── Anomaly event generator ─────────────────────────────── */
function genEvents(label: string, ragLabel: string, inverted?: boolean) {
  const breachDirection = inverted ? 'above' : 'below';
  if (ragLabel === 'CRITICAL') {
    return [
      { time: '03:22', sev: 'critical', text: `${label} anomaly detected — auto-escalation triggered to control room` },
      { time: '09:14', sev: 'warning',  text: `${label} ${breachDirection} warning threshold — alert dispatched to operations team` },
    ];
  }
  if (ragLabel === 'WARNING') {
    return [{ time: '09:14', sev: 'warning', text: `${label} ${breachDirection} warning threshold — monitoring interval increased to 5 min` }];
  }
  return [{ time: '14:30', sev: 'info', text: `${label} performing within optimal range — no immediate action required` }];
}

function toCode(label: string) {
  const words = (label || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0].slice(0, 4).toUpperCase()}-${words[1].slice(0, 3).toUpperCase()}`;
  return (label || 'KPI').slice(0, 7).toUpperCase();
}

/* ─── Types ─────────────────────────────────────────────── */
export interface SubValue { label: string; value: string | number; }

export interface KPIDetailData {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  trend?: number;
  color?: string;
  thresholds?: { green: number; amber: number };
  inverted?: boolean;
  definition?: string;
  subValues?: SubValue[];
  analysis?: string;
  target?: string;
  category?: string;
}

interface Props {
  kpi: KPIDetailData | null;
  onClose: () => void;
  showAnalysis?: boolean;
}

/* ═══════════════════════════════════════════════════════════ */
export default function CWMKPIDetailModal({ kpi, onClose, showAnalysis = true }: Props) {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('24H');
  const [showPrediction, setShowPrediction] = useState(false);

  const numValue = useMemo(() => parseFloat(String(kpi?.value)) || 0, [kpi]);
  const rag = useMemo(() => {
    if (kpi?.color) {
      const key = deriveRag(kpi.color);
      return getRag(numValue, undefined, false, key);
    }
    return getRag(numValue, kpi?.thresholds, kpi?.inverted);
  }, [numValue, kpi]);

  const ytdAvg       = useMemo(() => numValue > 0 ? parseFloat((numValue * 0.977).toFixed(1)) : 0, [numValue]);
  const thirtyDayAvg = useMemo(() => numValue > 0 ? parseFloat((numValue * 0.964).toFixed(1)) : 0, [numValue]);

  const targetNum = useMemo(() => {
    if (kpi?.thresholds?.green != null) return kpi.thresholds.green;
    const p = parseFloat(kpi?.target || '');
    return isNaN(p) ? parseFloat((numValue * 1.05).toFixed(1)) : p;
  }, [kpi, numValue]);

  const availableRanges = useMemo(() => getKpiTimeRanges(kpi!), [kpi]);
  const activeTimeRange: TimeRangeKey = availableRanges.includes(timeRange) ? timeRange : availableRanges[0];
  const cfg = TIME_CFG[activeTimeRange] || TIME_CFG['24H'];

  const hist = useMemo(() => buildHist(numValue, kpi?.trend || 0, cfg.n), [numValue, kpi?.trend, activeTimeRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const pred = useMemo(() => buildPred(hist, kpi?.trend || 0), [hist, kpi?.trend]);

  const histLabels = useMemo(() => Array.from({ length: cfg.n }, (_, i) => cfg.lbl(i)), [activeTimeRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const predLabels = useMemo(() => Array.from({ length: 8 }, (_, i) => `+${i + 1}h`), []);
  const allLabels  = useMemo(() => (showPrediction ? [...histLabels, ...predLabels] : histLabels), [showPrediction, histLabels, predLabels]);

  const warnVal    = kpi?.thresholds ? kpi.thresholds.amber : null;
  const threshPlugin = useMemo(() => makePlugin(targetNum, warnVal), [targetNum, warnVal]);

  const bands = useMemo(() => {
    const u = kpi?.unit || '';
    if (!kpi?.thresholds) {
      return [
        { label: 'NORMAL',   color: 'emerald', desc: `≥ 80${u}` },
        { label: 'WARNING',  color: 'amber',   desc: `50–80${u}` },
        { label: 'CRITICAL', color: 'red',     desc: `< 50${u}` },
      ];
    }
    const { green, amber } = kpi.thresholds;
    if (!kpi.inverted) {
      return [
        { label: 'NORMAL',   color: 'emerald', desc: `≥ ${green}${u}` },
        { label: 'WARNING',  color: 'amber',   desc: `${amber}–${green}${u}` },
        { label: 'CRITICAL', color: 'red',     desc: `< ${amber}${u}` },
      ];
    }
    return [
      { label: 'NORMAL',   color: 'emerald', desc: `≤ ${green}${u}` },
      { label: 'WARNING',  color: 'amber',   desc: `${green}–${amber}${u}` },
      { label: 'CRITICAL', color: 'red',     desc: `> ${amber}${u}` },
    ];
  }, [kpi]);

  const bandStyle: Record<string, { title: string; solidBg: string; solidBorder: string }> = {
    emerald: { title: 'text-emerald-400', solidBg: 'var(--cwm-modal-success-bg)', solidBorder: 'var(--cwm-modal-success-border)' },
    amber:   { title: 'text-amber-400',   solidBg: 'var(--cwm-modal-warning-bg)', solidBorder: 'var(--cwm-modal-warning-border)' },
    red:     { title: 'text-red-400',     solidBg: 'var(--cwm-modal-danger-bg)',  solidBorder: 'var(--cwm-modal-danger-border)' },
  };

  const chartData = useMemo(() => {
    const actualData = showPrediction ? [...hist, ...Array(8).fill(null)] : hist;
    const t = getChartTokens();
    const datasets: any[] = [
      {
        label: `${activeTimeRange} Actual`,
        data: actualData,
        borderColor: CHART_PALETTES.area.sky.border,
        backgroundColor: CHART_PALETTES.area.sky.fill,
        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
      },
      ...(kpi?.thresholds ? [{
        label: 'Target',
        data: Array(allLabels.length).fill(targetNum),
        borderColor: t.tickMuted, borderWidth: 1.5, borderDash: [6, 4],
        pointRadius: 0, fill: false, tension: 0,
      }] : []),
      ...(warnVal != null ? [{
        label: 'Warn',
        data: Array(allLabels.length).fill(warnVal),
        borderColor: t.violet, borderWidth: 1.5, borderDash: [3, 3],
        pointRadius: 0, fill: false, tension: 0,
      }] : []),
      ...(showPrediction ? [{
        label: 'Predicted',
        data: [...Array(hist.length).fill(null), ...pred],
        borderColor: t.violet,
        backgroundColor: t.violetBg,
        fill: true, tension: 0.4, pointRadius: 2.5,
        pointBackgroundColor: t.violet, pointBorderColor: getCSSVar('--cwm-bg'),
        borderWidth: 2, borderDash: [6, 4],
      }] : []),
    ];
    return { labels: allLabels, datasets };
  }, [hist, pred, allLabels, showPrediction, kpi, targetNum, warnVal, activeTimeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const chartOpts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    layout: { padding: { right: kpi?.thresholds ? 46 : 8 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltip(),
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) : '—'} ${kpi?.unit || ''}`,
        },
      },
    },
    scales: chartScales({ x: { ticks: { maxTicksLimit: 12 } } }),
  }), [kpi]); // eslint-disable-line react-hooks/exhaustive-deps

  const events   = useMemo(() => genEvents(kpi?.label || '', rag.label, kpi?.inverted), [kpi?.label, rag.label, kpi?.inverted]);
  const analyses = useMemo(() => (kpi?.analysis || '').split('|').map(s => s.trim()).filter(s => s.length > 3), [kpi?.analysis]);
  const subs     = kpi?.subValues || [];
  const mainSubs = subs.filter(m => !/target/i.test(m.label));
  const targetSubs = subs.filter(m => /target/i.test(m.label));

  if (!kpi) return null;

  const code     = toCode(kpi.label);
  const category = kpi.category || 'SWM DASHBOARD';

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />

      <div className="relative h-full flex flex-col shadow-2xl animate-slide-in-right"
        style={{ width: 680, borderLeft: '1px solid var(--cwm-border)', background: 'var(--cwm-panel)', borderRadius: 0 }}>

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-cwm-border flex items-center justify-between shrink-0"
          style={{ background: 'var(--cwm-panel)', borderRadius: 0 }}>
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: rag.solidBg, border: `1px solid ${rag.solidBorder}` }}>
              {kpi.icon}
            </div>
            <div>
              <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-semibold mb-1">
                {code} · {category}
              </p>
              <h2 className="text-xl font-bold text-white leading-tight">{kpi.label}</h2>
            </div>
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <span className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${rag.text}`}
              style={{ background: rag.badgeSolidBg, borderColor: rag.badgeSolidBorder }}>
              <span className={`w-1.5 h-1.5 rounded-full ${rag.dot} animate-pulse`} />
              <span>{rag.label}</span>
            </span>
            <button onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin' }}>

          {/* Compact 4-card metric strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Current Value', content: <><span className="text-2xl font-bold text-white">{kpi.value}</span>{kpi.unit && <span className="text-xs text-slate-400 ml-1">{kpi.unit}</span>}</>, sub: <p className={`text-[9px] mt-1.5 font-medium ${(kpi.trend || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(kpi.trend || 0) >= 0 ? '▲' : '▼'} {Math.abs(kpi.trend || 0).toFixed(1)}% vs yesterday</p> },
              { label: '⊙ Target',     content: <><span className="text-2xl font-bold text-white">{targetNum}</span>{kpi.unit && <span className="text-xs text-slate-400 ml-1">{kpi.unit}</span>}</>, sub: null },
              { label: '📅 YTD Avg',   content: <><span className="text-2xl font-bold text-white">{ytdAvg}</span>{kpi.unit && <span className="text-xs text-slate-400 ml-1">{kpi.unit}</span>}</>, sub: null },
              { label: '◈ 30-Day Avg', content: <><span className="text-2xl font-bold text-white">{thirtyDayAvg}</span>{kpi.unit && <span className="text-xs text-slate-400 ml-1">{kpi.unit}</span>}</>, sub: null },
            ].map((card, i) => (
              <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--cwm-panel)', border: '1px solid var(--cwm-border)' }}>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">{card.label}</p>
                <div className="leading-none">{card.content}</div>
                {card.sub}
              </div>
            ))}
          </div>

          {/* Main bento: chart (2 cols) + thresholds/definition (1 col) */}
          <div className="grid grid-cols-3 gap-3 mb-3">

            {/* Chart – spans 2 columns */}
            <div className="col-span-2 rounded-xl p-4" style={{ background: 'var(--cwm-panel)', border: '1px solid var(--cwm-border)' }}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-[10px] font-bold text-white uppercase tracking-wider">{cfg.title}</p>
                <div className="flex items-center space-x-2">
                  <div className="cwm-timeframe-control">
                    {availableRanges.map((r) => (
                      <button key={r} onClick={() => { setTimeRange(r); setShowPrediction(false); }}
                        className={`cwm-timeframe-btn ${activeTimeRange === r ? 'is-active' : ''}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowPrediction(p => !p)}
                    className="cwm-advisory-btn"
                    style={{ height: 26, padding: '0 10px', fontSize: 10, borderRadius: 6, background: showPrediction ? undefined : 'transparent', boxShadow: showPrediction ? undefined : 'none' }}>
                    <span>✦</span><span>Predict Trend</span>
                  </button>
                </div>
              </div>

              <div style={{ height: 210 }}>
                <Line data={chartData} options={chartOpts} plugins={[threshPlugin as any]} />
              </div>

              {showPrediction && (
                <div className="mt-2 pt-2 border-t border-cwm-border flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">◄ {activeTimeRange} historical (3 parts)</span>
                  <span className="text-violet-400">8h predicted trend (1 part) ►</span>
                </div>
              )}
            </div>

            {/* Right column: threshold bands + definition */}
            <div className="col-span-1 flex flex-col gap-2">
              <div className="rounded-xl p-3" style={{ background: 'var(--cwm-panel)', border: '1px solid var(--cwm-border)' }}>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2">Threshold Bands</p>
                <div className="flex flex-col gap-1.5">
                  {bands.map((b, i) => {
                    const s = bandStyle[b.color];
                    return (
                      <div key={i} className="flex items-center justify-between rounded-lg px-2.5 py-2"
                        style={{ background: s.solidBg, border: `1px solid ${s.solidBorder}` }}>
                        <p className={`text-[9px] font-bold ${s.title} uppercase tracking-wider`}>{b.label}</p>
                        <p className={`text-xs font-bold ${s.title}`}>{b.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {kpi.definition && (
                <div className="rounded-xl p-3 flex-1"
                  style={{ background: 'var(--cwm-modal-teal-bg)', border: '1px solid var(--cwm-modal-teal-border)' }}>
                  <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1.5 flex items-center space-x-1">
                    <span>ℹ</span><span>Definition</span>
                  </p>
                  <p className="text-[10px] text-slate-400 leading-relaxed">{kpi.definition}</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom row: anomalies + related metrics */}
          <div className={`grid gap-3 mb-3 ${subs.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>

            {/* Detected Anomalies & Events */}
            <div>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2">
                Detected Anomalies &amp; Events
              </p>
              <div className="space-y-1.5">
                {events.map((e, i) => (
                  <div key={i} className="flex items-start space-x-3 rounded-xl px-3 py-2.5"
                    style={{
                      background: e.sev === 'critical' ? 'var(--cwm-modal-danger-bg)' : e.sev === 'warning' ? 'var(--cwm-modal-warning-bg)' : 'var(--cwm-modal-info-bg)',
                      border: `1px solid ${e.sev === 'critical' ? 'var(--cwm-modal-danger-border)' : e.sev === 'warning' ? 'var(--cwm-modal-warning-border)' : 'var(--cwm-modal-info-border)'}`
                    }}>
                    <span className={`text-sm mt-0.5 ${e.sev === 'critical' ? 'text-red-400' : e.sev === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>
                      {e.sev === 'critical' ? '⊘' : e.sev === 'warning' ? '⚠' : 'ℹ'}
                    </span>
                    <div>
                      <span className={`text-[10px] font-bold ${e.sev === 'critical' ? 'text-red-400' : e.sev === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>{e.time}</span>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{e.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Related Metrics */}
            {subs.length > 0 && (
              <div>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                  <span style={{ color: 'var(--cwm-accent)' }}>◈</span> Related Metrics
                </p>
                {mainSubs.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {mainSubs.map((m, i) => {
                      const isCrit = /critical|danger|error|failed/i.test(m.label);
                      const isWarn = /miss|overdue|lost|excess|pending/i.test(m.label);
                      const bg = isCrit ? 'var(--cwm-modal-danger-bg)' : isWarn ? 'var(--cwm-modal-warning-bg)' : 'var(--cwm-surface-soft)';
                      const borderClr = isCrit ? 'var(--cwm-modal-danger-border)' : isWarn ? 'var(--cwm-modal-warning-border)' : 'var(--cwm-border)';
                      const valClr = isCrit ? 'var(--cwm-danger)' : isWarn ? 'var(--cwm-warning)' : 'var(--cwm-text)';
                      return (
                        <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: bg, border: `1px solid ${borderClr}` }}>
                          <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--cwm-text-faint)' }}>{m.label}</p>
                          <p className="text-xl font-bold leading-none" style={{ color: valClr }}>{m.value}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {targetSubs.map((m, i) => (
                  <div key={i} className="flex items-center gap-4 rounded-xl px-3 py-2.5 mt-2"
                    style={{ background: 'var(--cwm-modal-info-bg)', border: '1px solid var(--cwm-modal-info-border)' }}>
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--cwm-accent)' }}>Target</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--cwm-text)' }}>{m.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Advisory */}
          {showAnalysis && analyses.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--cwm-modal-advisory-bg)', border: '1px solid var(--cwm-modal-advisory-border)' }}>
              <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-3 flex items-center space-x-2">
                <span>ⓘ</span><span>AI Advisory</span>
              </p>
              <div className="space-y-2">
                {analyses.map((s, i) => (
                  <div key={i} className="flex items-start space-x-2">
                    <span className="text-violet-500 mt-0.5 font-bold text-xs">→</span>
                    <p className="text-xs text-slate-400 leading-relaxed">{s.trim()}.</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-cwm-border flex items-center justify-between shrink-0"
          style={{ background: 'var(--cwm-panel)', borderRadius: 0 }}>
          <p className="text-[10px] text-slate-400">
            Last updated: {new Date().toLocaleTimeString()} · GTSU Command Center
          </p>
          <button onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-md border transition-colors"
            style={{ background: 'var(--cwm-surface-soft)', borderColor: 'var(--cwm-border)', color: 'var(--cwm-text-muted)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
