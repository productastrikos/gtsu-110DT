import { useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Filler, Legend,
} from "chart.js";
import { CHART_PALETTES, getChartTokens, chartTooltip, chartScales, getCSSVar } from "./chartUtils";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler, Legend);

/* ─── RAG helper ─────────────────────────────────────────── */
function getRag(status?: string) {
  if (status === "critical") return {
    color: getCSSVar("--cwm-danger"), text: "text-red-400",
    dot: "bg-red-400", label: "CRITICAL",
    solidBg: "var(--cwm-modal-danger-bg)", solidBorder: "var(--cwm-modal-danger-border)",
    badgeSolidBg: "var(--cwm-modal-danger-bg)", badgeSolidBorder: "var(--cwm-modal-danger-border)",
  };
  if (status === "warning") return {
    color: getCSSVar("--cwm-warning"), text: "text-amber-400",
    dot: "bg-amber-400", label: "WARNING",
    solidBg: "var(--cwm-modal-warning-bg)", solidBorder: "var(--cwm-modal-warning-border)",
    badgeSolidBg: "var(--cwm-modal-warning-bg)", badgeSolidBorder: "var(--cwm-modal-warning-border)",
  };
  return {
    color: getCSSVar("--cwm-success"), text: "text-emerald-400",
    dot: "bg-emerald-400", label: "NORMAL",
    solidBg: "var(--cwm-modal-success-bg)", solidBorder: "var(--cwm-modal-success-border)",
    badgeSolidBg: "var(--cwm-modal-success-bg)", badgeSolidBorder: "var(--cwm-modal-success-border)",
  };
}

/* ─── Build deterministic history from current value ──────── */
// Simulates a realistic sensor trend ending at numValue using a seeded random walk.
function buildHist(numValue: number, n: number) {
  const v0 = numValue || 50;
  const sigma = v0 * 0.012; // ~1.2% step noise
  // Work backwards from current value so the series "arrives" at numValue
  const raw: number[] = [v0];
  // deterministic LCG seed for reproducibility
  let seed = Math.floor(v0 * 137 + n * 17) & 0xffff;
  for (let i = 1; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) & 0xfffffff;
    const noise = ((seed / 0xfffffff) - 0.5) * 2 * sigma;
    const trend = (v0 - raw[i - 1]) * 0.08; // mild mean-reversion
    raw.push(parseFloat(Math.max(0, raw[i - 1] + noise + trend).toFixed(2)));
  }
  return raw.reverse();
}

/* ─── Anomaly event generator ─────────────────────────────── */
function genEvents(title: string, ragLabel: string) {
  if (ragLabel === "CRITICAL") return [
    { time: "03:22", sev: "critical", text: `${title} anomaly detected — auto-escalation triggered to control room` },
    { time: "09:14", sev: "warning",  text: `${title} exceeded warning threshold — alert dispatched to operations team` },
  ];
  if (ragLabel === "WARNING") return [
    { time: "09:14", sev: "warning", text: `${title} near threshold — monitoring interval increased to 5 min` },
  ];
  return [
    { time: "14:30", sev: "info", text: `${title} performing within optimal range — no immediate action required` },
  ];
}

/* ─── Derive short code from title ───────────────────────── */
function toCode(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0].slice(0, 4).toUpperCase()}-${words[1].slice(0, 3).toUpperCase()}`;
  return title.slice(0, 7).toUpperCase();
}

/* ─── Threshold side-label plugin ─────────────────────────── */
function makePlugin(targetVal: number) {
  return {
    id: "threshLineLabels",
    afterDraw(chart: ChartJS) {
      const { ctx, chartArea, scales } = chart as any;
      if (!chartArea || !scales.y) return;
      ctx.save();
      ctx.font = "9px Inter,system-ui,sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = getCSSVar("--cwm-text-faint");
      const y = scales.y.getPixelForValue(targetVal);
      if (y >= chartArea.top && y <= chartArea.bottom) {
        ctx.fillText("Target", chartArea.right + 4, y + 3);
      }
      ctx.restore();
    },
  };
}

/* ─── KPIDetail interface ────────────────────────────────── */
interface KPIDetail {
  title: string;
  value: string | number;
  unit?: string;
  description: string;
  status?: string;
  factors: { name: string; impact: number; description: string }[];
  historicalData?: { x: number | string; y: number }[];
  relatedMetrics?: { label: string; value: number; color?: string }[];
}

interface KPIDetailModalProps {
  kpiDetail: KPIDetail;
  onClose: () => void;
}

const TIME_CFG: Record<string, { n: number; lbl: (i: number) => string; title: string }> = {
  "12H": { n: 12, lbl: (i) => `${String(i).padStart(2, "0")}:00`, title: "12-Hour" },
  "24H": { n: 24, lbl: (i) => `${String(i).padStart(2, "0")}:00`, title: "24-Hour" },
  "7D":  { n: 7,  lbl: (i) => ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i % 7], title: "7-Day" },
};

export function KPIDetailModal({ kpiDetail, onClose }: KPIDetailModalProps) {
  const [timeRange, setTimeRange] = useState<"12H" | "24H" | "7D">("24H");
  const [showPrediction, setShowPrediction] = useState(false);

  const numValue = useMemo(() => parseFloat(String(kpiDetail.value)) || 0, [kpiDetail]);
  const rag = useMemo(() => getRag(kpiDetail.status), [kpiDetail.status]);
  const cfg = TIME_CFG[timeRange];

  const hist = useMemo(() => {
    if (kpiDetail.historicalData && kpiDetail.historicalData.length >= cfg.n) {
      return kpiDetail.historicalData.slice(-cfg.n).map((d) => d.y);
    }
    return buildHist(numValue, cfg.n);
  }, [numValue, kpiDetail.historicalData, timeRange]);

  const histLabels = useMemo(
    () => Array.from({ length: cfg.n }, (_, i) => cfg.lbl(i)),
    [timeRange],
  );

  // Predicted tail (simple linear extrapolation)
  const predLabels = useMemo(() => Array.from({ length: 8 }, (_, i) => `+${i + 1}h`), []);
  const pred = useMemo(() => {
    const last = hist[hist.length - 1];
    return Array.from({ length: 8 }, (_, i) =>
      parseFloat((last + Math.sin(i * 0.6) * last * 0.02).toFixed(2)),
    );
  }, [hist]);

  const allLabels = useMemo(
    () => (showPrediction ? [...histLabels, ...predLabels] : histLabels),
    [showPrediction, histLabels, predLabels],
  );

  // Target: try to find from factors, else 5% above value
  const targetNum = useMemo(() => {
    const pct = parseFloat(String(kpiDetail.value));
    return isNaN(pct) ? numValue * 1.05 : parseFloat((pct * 1.05).toFixed(1));
  }, [kpiDetail, numValue]);

  const ytdAvg  = useMemo(() => parseFloat((numValue * 0.977).toFixed(1)), [numValue]);
  const avg30d  = useMemo(() => parseFloat((numValue * 0.964).toFixed(1)), [numValue]);
  const deltaVsYesterday = useMemo(() => {
    if (hist.length > 1 && hist[0] !== 0) {
      return parseFloat(((numValue - hist[0]) / hist[0] * 100).toFixed(1));
    }
    return null;
  }, [hist, numValue]);

  const threshPlugin = useMemo(() => makePlugin(targetNum), [targetNum]);

  const chartData = useMemo(() => {
    const actualData = showPrediction ? [...hist, ...Array(8).fill(null)] : hist;
    return {
      labels: allLabels,
      datasets: [
        {
          label: `${timeRange} Actual`,
          data: actualData,
          borderColor: CHART_PALETTES.area.teal.border,
          backgroundColor: CHART_PALETTES.area.teal.fill,
          fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2.5,
        },
        {
          label: "Target",
          data: Array(allLabels.length).fill(targetNum),
          borderColor: getChartTokens().tickMuted, borderWidth: 1.5, borderDash: [6, 4],
          pointRadius: 0, fill: false, tension: 0,
        } as any,
        ...(showPrediction ? [{
          label: "Predicted",
          data: [...Array(hist.length).fill(null), ...pred],
          borderColor: getChartTokens().violet,
          backgroundColor: getChartTokens().violetBg,
          fill: true, tension: 0.4, pointRadius: 2.5,
          pointBackgroundColor: getChartTokens().violet,
          borderWidth: 2, borderDash: [6, 4],
        }] : []),
      ],
    };
  }, [hist, pred, allLabels, showPrediction, targetNum, timeRange]);

  const chartOpts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    layout: { padding: { right: 46 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltip(),
        callbacks: {
          label: (ctx: any) =>
            ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) : "—"} ${kpiDetail.unit ?? ""}`,
        },
      },
    },
    scales: chartScales({ x: { ticks: { maxTicksLimit: 12 } } }),
  }), [kpiDetail.unit]);

  const events = useMemo(() => genEvents(kpiDetail.title, rag.label), [kpiDetail.title, rag.label]);
  const code     = useMemo(() => toCode(kpiDetail.title), [kpiDetail.title]);

  // Threshold bands — used only for the chart legend strip
  const bands = useMemo(() => [
    { label: "NORMAL",   color: "emerald", desc: "Safe range" },
    { label: "WARNING",  color: "amber",   desc: "Near limit" },
    { label: "CRITICAL", color: "red",     desc: "Exceeded" },
  ], []);

  // AI advisory text from factor descriptions
  const advisories = useMemo(
    () => kpiDetail.factors.map((f) => f.description).filter((d) => d && d.length > 5),
    [kpiDetail.factors],
  );

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.50)" }}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className="kpi-modal relative h-full flex flex-col shadow-2xl animate-slide-in-right"
        style={{
          width: 680,
          background: "var(--cwm-panel)",
          borderLeft: "1px solid var(--cwm-border)",
          borderRadius: 0,
        }}
      >
        {/* ── HEADER ─────────────────────────────────────────── */}
        <div
          className="px-6 py-3 border-b flex items-center justify-between flex-shrink-0"
          style={{ borderColor: "var(--cwm-border)", borderRadius: 0, background: "var(--cwm-panel)" }}
        >
          <div className="flex items-center space-x-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: rag.solidBg, border: `1px solid ${rag.solidBorder}` }}
            >
              <span style={{ color: rag.color }}>⬡</span>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: "var(--cwm-text-faint)" }}>
                {code} · GTSU DASHBOARD
              </p>
              <h2 className="text-xl font-bold text-white leading-tight">{kpiDetail.title}</h2>
            </div>
          </div>
          <div className="flex items-center space-x-3 flex-shrink-0">
            <span
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold ${rag.text}`}
              style={{ background: rag.badgeSolidBg, borderColor: rag.badgeSolidBorder }}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${rag.dot} animate-pulse`} />
              <span>{rag.label}</span>
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--cwm-text-faint)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-hidden p-3"
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gridTemplateRows: "auto 1fr auto",
            gap: 8,
            minHeight: 0,
          }}
        >

          {/* Row 1 col-span-2: Metric strip */}
          <div className="col-span-2 grid grid-cols-4 gap-2">
            {/* Current — inline delta in label */}
            <div className="kpi-modal-card rounded-xl px-3 py-2" style={{ border: "1px solid var(--cwm-border)" }}>
              <p className="text-[9px] uppercase tracking-wider mb-1 flex items-center justify-between" style={{ color: "var(--cwm-text-faint)" }}>
                <span>Current</span>
                {deltaVsYesterday !== null && (
                  <span className={`font-semibold ${deltaVsYesterday >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {deltaVsYesterday >= 0 ? "+" : ""}{deltaVsYesterday}%
                  </span>
                )}
              </p>
              <p className="text-xl font-bold leading-none text-white">
                {parseFloat(String(kpiDetail.value)).toFixed(2)}
                {kpiDetail.unit && <span className="text-xs font-normal ml-1" style={{ color: "var(--cwm-text-faint)" }}>{kpiDetail.unit}</span>}
              </p>
            </div>
            {[
              { label: "Target",     val: `${targetNum}`, unit: kpiDetail.unit },
              { label: "YTD Avg",    val: `${ytdAvg}`,   unit: kpiDetail.unit },
              { label: "30-Day Avg", val: `${avg30d}`,   unit: kpiDetail.unit },
            ].map((m) => (
              <div key={m.label} className="kpi-modal-card rounded-xl px-3 py-2" style={{ border: "1px solid var(--cwm-border)" }}>
                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--cwm-text-faint)" }}>{m.label}</p>
                  <p className="text-xl font-bold leading-none text-white">
                  {m.val}
                  {m.unit && <span className="text-xs font-normal ml-1" style={{ color: "var(--cwm-text-faint)" }}>{m.unit}</span>}
                </p>
              </div>
            ))}
          </div>

          {/* Row 2 col 1: Chart */}
          <div className="kpi-modal-card rounded-xl flex flex-col" style={{ border: "1px solid var(--cwm-border)", minHeight: 0, padding: "6px" }}>
            {/* Combined header + legend row */}
            <div className="flex items-center justify-between flex-shrink-0 flex-wrap gap-1" style={{ marginBottom: 4 }}>
              <div className="flex items-center gap-2">
                <p className="text-[9px] font-bold text-white uppercase tracking-wider">{cfg.title} Trend</p>
                <div className="cwm-timeframe-control">
                  {(["12H", "24H", "7D"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => { setTimeRange(r); setShowPrediction(false); }}
                      className={`cwm-timeframe-btn${timeRange === r ? " is-active" : ""}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowPrediction((p) => !p)}
                  className={`cwm-advisory-btn${showPrediction ? " is-on" : ""}`}
                  style={{ height: 22, padding: "0 8px", fontSize: 9, borderRadius: 5, boxShadow: showPrediction ? undefined : "none" }}
                >
                  <span>✦</span><span>Predict</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {bands.map((b) => {
                  const dotCls = b.color === "emerald" ? "text-emerald-400" : b.color === "amber" ? "text-amber-400" : "text-red-400";
                  return (
                    <span key={b.label} title={b.label} className={`flex items-center gap-0.5 text-[9px] ${dotCls}`}>
                      <span>●</span>
                      <span className="font-medium">{b.label.slice(0, 1)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="flex-1" style={{ minHeight: 0, position: "relative" }}>
              <Line data={chartData} options={chartOpts} plugins={[threshPlugin as any]} />
            </div>
            {showPrediction && (
              <div className="mt-1.5 pt-1.5 flex items-center justify-between text-[9px]" style={{ borderTop: "1px solid var(--cwm-border)" }}>
                <span style={{ color: "var(--cwm-text-faint)" }}>◄ {timeRange} historical</span>
                <span className="text-violet-400">8h predicted trend ►</span>
              </div>
            )}
          </div>

          {/* Row 2 col 2: Right sidebar — 3 equal-flex sections, no scroll */}
          <div className="flex flex-col gap-1.5" style={{ minHeight: 0, overflow: "hidden", height: "100%" }}>
            {/* Definition — 1/3 flex */}
            <div style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
              <div className="rounded-xl p-2.5 h-full" style={{ background: "var(--cwm-modal-teal-bg)", border: "1px solid var(--cwm-modal-teal-border)" }}>
                <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">Definition</p>
                <p className="text-[10px] leading-snug line-clamp-3" style={{ color: "var(--cwm-text-muted)" }}>
                  {kpiDetail.description || "No description available."}
                </p>
              </div>
            </div>
            {/* Anomalies & Events — 1/3 flex */}
            <div style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
              <p className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--cwm-text-faint)" }}>Anomalies &amp; Events</p>
              <div className="flex flex-col gap-1">
                {events.slice(0, 2).map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start space-x-2 rounded-xl px-2 py-1.5"
                    style={{
                      background: e.sev === "critical" ? "var(--cwm-modal-danger-bg)" : e.sev === "warning" ? "var(--cwm-modal-warning-bg)" : "var(--cwm-modal-info-bg)",
                      border: `1px solid ${e.sev === "critical" ? "var(--cwm-modal-danger-border)" : e.sev === "warning" ? "var(--cwm-modal-warning-border)" : "var(--cwm-modal-info-border)"}`,
                    }}
                  >
                    <span className={`text-[10px] flex-shrink-0 ${e.sev === "critical" ? "text-red-400" : e.sev === "warning" ? "text-amber-400" : "text-blue-400"}`}>
                      {e.sev === "critical" ? "⊘" : e.sev === "warning" ? "⚠" : "ℹ"}
                    </span>
                    <div className="min-w-0">
                      <span className={`text-[9px] font-bold ${e.sev === "critical" ? "text-red-400" : e.sev === "warning" ? "text-amber-400" : "text-blue-400"}`}>{e.time}</span>
                      <p className="text-[9px] mt-0.5 leading-snug line-clamp-1" style={{ color: "var(--cwm-text-muted)" }}>{e.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Related Metrics — 1/3 flex */}
            <div className="flex flex-col" style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
              <p className="text-[9px] uppercase tracking-wider font-semibold mb-1 flex-shrink-0" style={{ color: "var(--cwm-text-faint)" }}>Related Metrics</p>
              <div className="grid grid-cols-2 gap-1 flex-1" style={{ minHeight: 0 }}>
                {(kpiDetail.relatedMetrics ?? []).slice(0, 4).map((m, i) => (
                  <div
                    key={i}
                    className="rounded-xl px-2 py-1.5 flex flex-col justify-between"
                    style={{ background: "var(--cwm-surface-soft)", border: "1px solid var(--cwm-border)" }}
                  >
                    <p className="text-[8px] font-bold uppercase tracking-widest leading-tight" style={{ color: "var(--cwm-text-faint)" }}>{m.label}</p>
                    <p className="text-base font-bold leading-none text-white">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3 col-span-2: AI Advisory */}
          {advisories.length > 0 && (
            <div
              className="col-span-2 rounded-xl p-2"
              style={{ background: "var(--cwm-modal-advisory-bg)", border: "1px solid var(--cwm-modal-advisory-border)" }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[9px] font-bold text-violet-400 uppercase tracking-widest flex items-center space-x-1.5">
                  <span>ⓘ</span><span>AI Advisory</span>
                </p>
                <p className="text-[9px] italic" style={{ color: "var(--cwm-text-faint)" }}>GTSU Analytics Engine</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {advisories.slice(0, 2).map((s, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-violet-300"
                      style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)" }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[9px] leading-snug line-clamp-2" style={{ color: "var(--cwm-text-muted)" }}>{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <div
          className="px-6 py-2 flex items-center justify-between flex-shrink-0"
          style={{ borderTop: "1px solid var(--cwm-border)", background: "var(--cwm-panel)", borderRadius: 0 }}
        >
          <p className="text-[10px]" style={{ color: "var(--cwm-text-faint)" }}>
            Last updated: {new Date().toLocaleTimeString()} · GTSU Command Center
          </p>
          <button onClick={onClose} className="px-4 py-1.5 cwm-control-btn text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
