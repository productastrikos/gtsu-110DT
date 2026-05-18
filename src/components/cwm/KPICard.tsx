import React from 'react';

/* ─── SVG Icon library (line-art, 24×24 viewBox) ──────── */
const Ico = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
    {children}
  </svg>
);
export const IcoCoverage    = () => <Ico><rect x="2" y="14" width="3" height="6" rx="0.5" fill="currentColor" stroke="none"/><rect x="7" y="10" width="3" height="10" rx="0.5" fill="currentColor" stroke="none"/><rect x="12" y="6" width="3" height="14" rx="0.5" fill="currentColor" stroke="none"/><rect x="17" y="2" width="3" height="18" rx="0.5" fill="currentColor" stroke="none"/></Ico>;
export const IcoAlert       = () => <Ico><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></Ico>;
export const IcoRoute       = () => <Ico><path d="M3 15l4-4 4 4"/><path d="M7 11v8"/><path d="M21 9l-4 4-4-4"/><path d="M17 13V5"/></Ico>;
export const IcoTrash       = () => <Ico><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></Ico>;
export const IcoRecycle     = () => <Ico><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/></Ico>;
export const IcoBarChart    = () => <Ico><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Ico>;
export const IcoClock       = () => <Ico><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Ico>;
export const IcoCheck       = () => <Ico><polyline points="20 6 9 17 4 12"/></Ico>;
export const IcoSmile       = () => <Ico><circle cx="12" cy="12" r="10"/><path d="M8 13s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="9" r="0.5" fill="currentColor"/><circle cx="15" cy="9" r="0.5" fill="currentColor"/></Ico>;
export const IcoShield      = () => <Ico><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></Ico>;
export const IcoPin         = () => <Ico><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></Ico>;
export const IcoCalendar    = () => <Ico><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Ico>;
export const IcoTruck       = () => <Ico><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></Ico>;
export const IcoPeople      = () => <Ico><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></Ico>;
export const IcoWrench      = () => <Ico><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></Ico>;
export const IcoLock        = () => <Ico><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></Ico>;
export const IcoScale       = () => <Ico><line x1="12" y1="3" x2="12" y2="21"/><path d="M5 7l7-4 7 4"/><path d="M5 20h14"/><polyline points="5 11 5 7 19 7 19 11"/><path d="M5 11a3 3 0 006 0M13 11a3 3 0 006 0"/></Ico>;
export const IcoLeaf        = () => <Ico><path d="M17 8C8 10 5.9 16.17 3.82 19.34A9.49 9.49 0 0012 22c5.52 0 10-4.48 10-10A10 10 0 0017 8z"/></Ico>;
export const IcoPhone       = () => <Ico><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></Ico>;
export const IcoBox         = () => <Ico><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></Ico>;
export const IcoDollar      = () => <Ico><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></Ico>;
export const IcoTrendUp     = () => <Ico><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></Ico>;
export const IcoHourglass   = () => <Ico><path d="M5 22h14M5 2h14"/><path d="M17 22v-4.17a2 2 0 00-.59-1.42L12 12l-4.41 4.41A2 2 0 007 17.83V22"/><path d="M7 2v4.17a2 2 0 00.59 1.42L12 12l4.41-4.41A2 2 0 0017 6.17V2"/></Ico>;
export const IcoBolt        = () => <Ico><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Ico>;
export const IcoClipboard   = () => <Ico><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></Ico>;
export const IcoThermometer = () => <Ico><path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/></Ico>;
export const IcoWind        = () => <Ico><path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/></Ico>;
export const IcoTrendDown   = () => <Ico><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></Ico>;

/* ─── RAG colour system ─────────────────────────────────── */
type RagKey = 'normal' | 'warning' | 'critical';
const RAG: Record<RagKey, { iconClr: string; badge: React.CSSProperties; label: string }> = {
  normal:   { iconClr: 'var(--cwm-success)', badge: { background: 'var(--cwm-success-bg)', color: 'var(--cwm-success)', borderColor: 'var(--cwm-success-border)' }, label: 'NORMAL' },
  warning:  { iconClr: 'var(--cwm-warning)', badge: { background: 'var(--cwm-warning-bg)', color: 'var(--cwm-warning)', borderColor: 'var(--cwm-warning-border)' }, label: 'WARNING' },
  critical: { iconClr: 'var(--cwm-danger)',  badge: { background: 'var(--cwm-danger-bg)',  color: 'var(--cwm-danger)',  borderColor: 'var(--cwm-danger-border)'  }, label: 'CRITICAL' },
};

export function deriveRag(color?: string): RagKey {
  if (!color) return 'normal';
  if (color.includes('red')) return 'critical';
  if (color.includes('amber') || color.includes('yellow') || color.includes('orange')) return 'warning';
  return 'normal';
}

interface KPICardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  color?: string;
  rag?: RagKey;
  trend?: number | null;
  onClick?: () => void;
  subValues?: { label: string; value: string | number }[];
}

export default function KPICard({ label, value, unit, icon, color, rag: ragProp, trend, onClick, subValues }: KPICardProps) {
  const ragKey = ragProp || deriveRag(color);
  const r = RAG[ragKey] || RAG.normal;
  const hasTrend = trend !== null && trend !== undefined;
  const isPos = (trend || 0) >= 0;

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className="kpi-card"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Top row: icon left, trend right */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-9 h-9 flex items-center justify-center text-base leading-none flex-shrink-0"
          style={{ color: r.iconClr }}
        >
          {icon || '▣'}
        </div>
        {hasTrend && (
          <div className="text-right">
            <div
              className="text-[11px] font-bold leading-tight"
              style={{ color: isPos ? 'var(--cwm-success)' : 'var(--cwm-danger)' }}
            >
              {isPos ? '▲' : '▼'} {Math.abs(trend as number).toFixed(1)}%
            </div>
            <div className="text-[9px] leading-tight mt-0.5" style={{ color: 'var(--cwm-text-faint)' }}>
              vs yesterday
            </div>
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mb-0.5 leading-none">
        <span className="text-[1.75rem] font-bold leading-none tracking-tight" style={{ color: 'var(--cwm-text)' }}>
          {value}
        </span>
        {unit && (
          <span className="text-xs font-medium ml-1.5" style={{ color: 'var(--cwm-text-faint)' }}>
            {unit}
          </span>
        )}
      </div>

      {/* Label */}
      <p className="text-[11px] font-medium mb-3 leading-snug" style={{ color: 'var(--cwm-text-muted)' }}>
        {label}
      </p>

      {/* Footer: badge left, view-details right */}
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] font-bold tracking-widest uppercase flex items-center gap-1"
          style={{ color: r.badge.color as string }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: r.badge.color as string }}
          />
          {r.label}
        </span>
        {onClick && (
          <span
            className="text-[9px] font-semibold tracking-wide uppercase flex items-center gap-0.5 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--cwm-text-faint)' }}
          >
            VIEW DETAILS <span style={{ color: r.badge.color as string }}>→</span>
          </span>
        )}
      </div>

      {/* Sub-values */}
      {subValues && subValues.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-white/5 grid grid-cols-2 gap-x-3 gap-y-1">
          {subValues.map((sv, i) => (
            <div key={i}>
              <div className="text-[10px] font-semibold" style={{ color: 'var(--cwm-text)' }}>{sv.value}</div>
              <div className="text-[9px]" style={{ color: 'var(--cwm-text-faint)' }}>{sv.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
