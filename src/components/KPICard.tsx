import { ReactNode } from "react";
import { ThresholdStatus } from "../types/engine";

/* ─── RAG colour maps (CSS-variable aware) ─────────────── */
const RAG: Record<string, {
  iconClr: string;
  dot: string;
  badge: { bg: string; color: string; border: string };
  label: string;
}> = {
  normal: {
    iconClr: '#3b7de8',
    dot:     'var(--cwm-success)',
    badge:   { bg: 'var(--cwm-success-bg)', color: 'var(--cwm-success)', border: 'var(--cwm-success-border)' },
    label:   'NORMAL',
  },
  warning: {
    iconClr: '#3b7de8',
    dot:     'var(--cwm-warning)',
    badge:   { bg: 'var(--cwm-warning-bg)', color: 'var(--cwm-warning)', border: 'var(--cwm-warning-border)' },
    label:   'WARNING',
  },
  critical: {
    iconClr: '#3b7de8',
    dot:     'var(--cwm-danger)',
    badge:   { bg: 'var(--cwm-danger-bg)', color: 'var(--cwm-danger)', border: 'var(--cwm-danger-border)' },
    label:   'CRITICAL',
  },
};

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  status: ThresholdStatus;
  icon?: ReactNode;
  onClick?: () => void;
}

export function KPICard({ title, value, unit, status, icon, onClick }: KPICardProps) {
  const r = RAG[status] ?? RAG.normal;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className="kpi-card"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {/* Top row: icon */}
      <div className="flex items-start mb-3">
        <div
          className="w-9 h-9 flex items-center justify-center flex-shrink-0"
          style={{ color: r.iconClr }}
        >
          {icon ?? <span style={{ fontSize: 18 }}>▣</span>}
        </div>
      </div>

      {/* Value */}
      <div className="mb-0.5 leading-none">
        <span
          className="text-[1.75rem] font-bold leading-none tracking-tight"
          style={{ color: 'var(--cwm-text)' }}
        >
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {unit && (
          <span className="text-xs font-medium ml-1.5" style={{ color: 'var(--cwm-text-faint)' }}>
            {unit}
          </span>
        )}
      </div>

      {/* Label */}
      <p
        className="text-[11px] font-medium mb-3 leading-snug"
        style={{ color: 'var(--cwm-text-muted)' }}
      >
        {title}
      </p>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', margin: '0 0 8px' }} />

      {/* Footer: badge left, view-details right */}
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] font-bold tracking-widest uppercase flex items-center gap-1"
          style={{ color: r.badge.color }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full inline-block"
            style={{ background: r.dot }}
          />
          {r.label}
        </span>
        {onClick && (
          <span
            className="text-[9px] font-semibold tracking-wide uppercase flex items-center gap-0.5 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--cwm-text-faint)' }}
          >
            VIEW DETAILS <span style={{ color: r.badge.color }}>→</span>
          </span>
        )}
      </div>
    </div>
  );
}
