/**
 * AlertDetailModal
 * Popup shown when an alert is clicked. Displays the full context and a
 * recommended action, and offers an "Investigate" button that redirects to
 * the most relevant page for that alert.
 */
import type { Alert } from '../services/socket';

const TYPE_META: Record<Alert['type'], { icon: string; bg: string; color: string; chip: string }> = {
  critical: { icon: '⚠', bg: 'var(--cwm-danger-bg)',  color: 'var(--cwm-danger)',  chip: 'status-chip-danger' },
  warning:  { icon: '▲', bg: 'var(--cwm-warning-bg)', color: 'var(--cwm-warning)', chip: 'status-chip-warning' },
  info:     { icon: 'ℹ', bg: 'var(--cwm-info-bg)',    color: 'var(--cwm-info)',    chip: 'status-chip-info' },
};

interface Props {
  alert: Alert;
  destinationLabel: string;
  onClose: () => void;
  onAcknowledge: () => void;
  onInvestigate: () => void;
}

export default function AlertDetailModal({ alert, destinationLabel, onClose, onAcknowledge, onInvestigate }: Props) {
  const meta = TYPE_META[alert.type];
  return (
    <div className="gtsu-modal-overlay" onClick={onClose}>
      <div className="gtsu-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="gtsu-modal-head">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 18, color: meta.color, fontWeight: 700 }}>{meta.icon}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className={`status-chip ${meta.chip}`}>{alert.type.toUpperCase()}</span>
              <span style={{ fontSize: 10, color: 'var(--cwm-text-faint)', textTransform: 'capitalize' }}>{alert.category} · {alert.zone}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cwm-text)', marginTop: 6, lineHeight: 1.3 }}>{alert.title}</div>
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Close" style={{ width: 28, height: 28, flexShrink: 0 }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="gtsu-modal-body">
          <div style={{ fontSize: 12.5, color: 'var(--cwm-text-muted)', lineHeight: 1.6 }}>{alert.message}</div>

          {alert.recommendedAction && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--cwm-accent-bg)', border: '1px solid var(--cwm-accent-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cwm-accent)', letterSpacing: '0.05em', marginBottom: 4 }}>RECOMMENDED ACTION</div>
              <div style={{ fontSize: 12, color: 'var(--cwm-text)', lineHeight: 1.55 }}>{alert.recommendedAction}</div>
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 18, fontSize: 11, color: 'var(--cwm-text-faint)', flexWrap: 'wrap' }}>
            <span>Asset: <b style={{ color: 'var(--cwm-text-muted)' }}>{alert.assetId}</b></span>
            <span>Zone: <b style={{ color: 'var(--cwm-text-muted)' }}>{alert.zone}</b></span>
          </div>
        </div>

        <div className="gtsu-modal-foot">
          <button className="gtsu-btn primary" style={{ flex: 1 }} onClick={onInvestigate}>
            INVESTIGATE · {destinationLabel} →
          </button>
          {!alert.acknowledged && (
            <button className="gtsu-btn ghost" onClick={onAcknowledge}>ACKNOWLEDGE</button>
          )}
          <button className="gtsu-btn ghost" onClick={onClose}>DISMISS</button>
        </div>
      </div>
    </div>
  );
}
