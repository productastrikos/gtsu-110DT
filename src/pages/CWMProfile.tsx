import { useState } from 'react';

interface ProfilePageProps {
  user?: Record<string, unknown>;
  onLogout?: () => void;
}

const ACTIVITY_LOG = [
  { action:'Acknowledged alert ENG-001 (TGT approaching limit)',       time:'09:42', type:'alert'   },
  { action:'Ran Normal Start simulation — advisories applied',          time:'09:18', type:'sim'     },
  { action:'Viewed PHM Dashboard — RUL trend analysis',                time:'09:10', type:'nav'     },
  { action:'Acknowledged advisory: Start sequence optimisation',        time:'08:55', type:'advisory'},
  { action:'Reviewed FMEA — updated Hung Start RPN score',              time:'08:40', type:'analysis'},
  { action:'Logged in',                                                 time:'08:30', type:'auth'    },
];

const ICON_TYPE: Record<string, string> = { alert:'🔔', sim:'⚡', nav:'📊', advisory:'🤖', analysis:'🔩', auth:'🔑' };

export default function ProfilePage({ user, onLogout }: ProfilePageProps) {
  const [tab, setTab] = useState<'profile' | 'activity' | 'settings'>('profile');

  const displayName = (user?.name as string) || (user?.username as string) || 'Operator';
  const role        = (user?.role as string) || 'Operations';
  const email       = (user?.email as string) || 'operator@cwm.lk';
  const initials    = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">
      <div className="page-header-block">
        <div>
          <div className="page-title">My Profile</div>
          <div className="page-subtitle">Account settings · Activity · Preferences</div>
        </div>
        {onLogout && (
          <button onClick={onLogout} className="px-4 py-2 text-sm font-semibold rounded-lg" style={{ background: 'var(--cwm-danger-bg)', color: 'var(--cwm-danger)', border: '1px solid var(--cwm-danger-border)' }}>
            Sign Out
          </button>
        )}
      </div>

      {/* Avatar card */}
      <div className="rounded-xl p-5 flex items-center gap-4" style={{ background: 'var(--cwm-panel)', border: '1px solid var(--cwm-border)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0" style={{ background: 'var(--cwm-accent)' }}>{initials}</div>
        <div>
          <div className="text-lg font-bold" style={{ color: 'var(--cwm-text)' }}>{displayName}</div>
          <div className="text-sm capitalize" style={{ color: 'var(--cwm-text-muted)' }}>{role}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--cwm-text-faint)' }}>{email}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: 'var(--cwm-success-bg)', color: 'var(--cwm-success)', border: '1px solid var(--cwm-success-border)' }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--cwm-success)' }} />Active
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--cwm-surface-soft)', border: '1px solid var(--cwm-border)' }}>
        {(['profile', 'activity', 'settings'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="px-4 py-1.5 rounded-md text-xs font-semibold capitalize transition-all"
            style={{ background: tab === t ? 'var(--cwm-accent)' : 'transparent', color: tab === t ? '#fff' : 'var(--cwm-text-muted)' }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--cwm-panel)', border: '1px solid var(--cwm-border)' }}>
          <div className="text-xs font-bold" style={{ color: 'var(--cwm-text)' }}>Account Details</div>
          {[
            ['Full Name',    displayName],
            ['Username',     (user?.username as string) || 'operator'],
            ['Email',        email],
            ['Role',         role],
            ['Department',   'GTSU Programme Office'],
            ['Access Level', 'Engine Monitoring · PHM · Analysis · V&V'],
            ['Clearance',     'GTSU Ground Test Operations'],
            ['Engine Type',   'GTSU-110 Series'],
            ['Test Site',     'Astrikos Ground Test Facility'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cwm-border)' }}>
              <span className="text-xs" style={{ color: 'var(--cwm-text-muted)' }}>{k}</span>
              <span className="text-xs font-semibold" style={{ color: 'var(--cwm-text)' }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'activity' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--cwm-panel)', border: '1px solid var(--cwm-border)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--cwm-border)' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--cwm-text)' }}>Recent Activity</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--cwm-border)' }}>
            {ACTIVITY_LOG.map((entry, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="text-base flex-shrink-0">{ICON_TYPE[entry.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs" style={{ color: 'var(--cwm-text)' }}>{entry.action}</div>
                </div>
                <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--cwm-text-faint)' }}>{entry.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--cwm-panel)', border: '1px solid var(--cwm-border)' }}>
          <div className="text-xs font-bold" style={{ color: 'var(--cwm-text)' }}>Preferences</div>
          {[
            { label:'Email Notifications',  desc:'Receive alert emails', default:true  },
            { label:'SMS Alerts',           desc:'Critical alerts via SMS', default:false },
            { label:'Auto-refresh Dashboard', desc:'Refresh every 30s',  default:true  },
            { label:'Sound Alerts',         desc:'Play sound on critical alerts', default:false },
          ].map((pref, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: 'var(--cwm-border)' }}>
              <div>
                <div className="text-xs font-medium" style={{ color: 'var(--cwm-text)' }}>{pref.label}</div>
                <div className="text-[10px]" style={{ color: 'var(--cwm-text-faint)' }}>{pref.desc}</div>
              </div>
              <div className="w-8 h-4.5 rounded-full relative cursor-pointer" style={{ background: pref.default ? 'var(--cwm-accent)' : 'var(--cwm-border)', minWidth: 32, height: 18 }}>
                <div className="absolute top-0.5 rounded-full bg-white shadow" style={{ width: 14, height: 14, left: pref.default ? 'calc(100% - 16px)' : 2, transition: 'left 0.2s' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
