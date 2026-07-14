import { Alert } from '../services/socket';

const typeColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    dot: 'bg-red-500'    },
  warning:  { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  info:     { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   dot: 'bg-blue-400'   },
};

function timeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000)    return 'Just now';
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

interface AlertPanelProps {
  alerts?: Alert[];
  onClose: () => void;
  onAcknowledge?: (id: string) => void;
  onSelect?: (alert: Alert) => void;
}

export default function AlertPanel({ alerts = [], onClose, onAcknowledge, onSelect }: AlertPanelProps) {
  const active = alerts.filter(a => !a.acknowledged);
  const grouped = {
    critical: active.filter(a => a.type === 'critical'),
    warning:  active.filter(a => a.type === 'warning'),
    info:     active.filter(a => a.type === 'info'),
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--cwm-surface)' }}>
      <div className="px-4 py-3 border-b border-cwm-border flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--cwm-text)' }}>Real-Time Alerts</h3>
          <p className="text-xs" style={{ color: 'var(--cwm-text-muted)' }}>{active.length} active</p>
        </div>
        <button onClick={onClose} className="icon-btn" aria-label="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {(['critical', 'warning', 'info'] as const).map(type =>
          grouped[type].length > 0 && (
            <div key={type}>
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${typeColors[type].text}`}>
                {type} ({grouped[type].length})
              </div>
              {grouped[type].slice(0, 15).map(alert => (
                <div
                  key={alert.alertId}
                  onClick={() => onSelect?.(alert)}
                  role={onSelect ? 'button' : undefined}
                  className={`${typeColors[type].bg} border ${typeColors[type].border} rounded-lg p-2.5 mb-1.5 transition-transform ${onSelect ? 'cursor-pointer hover:-translate-y-px' : ''}`}
                >
                  <div className="flex items-start space-x-2">
                    <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${typeColors[type].dot} ${type === 'critical' ? 'animate-pulse' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--cwm-text)' }}>{alert.title}</p>
                      <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--cwm-text-muted)' }}>{alert.message}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px]" style={{ color: 'var(--cwm-text-faint)' }}>{timeSince(alert.createdAt)}</span>
                        <div className="flex items-center gap-3">
                          {onSelect && (
                            <span className="text-[10px] font-medium" style={{ color: 'var(--cwm-accent)' }}>Details →</span>
                          )}
                          {onAcknowledge && (
                            <button onClick={(e) => { e.stopPropagation(); onAcknowledge(alert.alertId); }}
                              className="text-[10px] font-medium" style={{ color: 'var(--cwm-text-faint)' }}>
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
        {active.length === 0 && (
          <div className="text-center text-sm py-8" style={{ color: 'var(--cwm-text-muted)' }}>
            No active alerts
          </div>
        )}
      </div>
    </div>
  );
}
