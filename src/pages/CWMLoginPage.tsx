import React, { useState } from 'react';
import { login } from '../services/api';

interface LoginPageProps {
  onLogin: (user: Record<string, unknown>, token: string) => void;
  theme?: 'dark' | 'light';
  onThemeToggle?: () => void;
}

export default function CWMLoginPage({ onLogin, theme = 'dark', onThemeToggle }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('Please enter your credentials.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await login(username.trim(), password);
      const { token, user } = res.data;
      onLogin(user, token);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`theme-${theme} min-h-screen flex`} style={{ background: 'var(--cwm-bg)', fontFamily: 'Roboto, sans-serif' }}>

      {/* ── Left branding panel (hidden on mobile) ─── */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 p-10 relative overflow-hidden"
        style={{ background: 'var(--cwm-surface)', borderRight: '1px solid var(--cwm-border)' }}>

        {/* Top logo */}
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-xl" style={{ background: 'var(--cwm-accent)' }}>G</div>
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--cwm-text)' }}>GTSU</div>
              <div className="text-[10px]" style={{ color: 'var(--cwm-text-faint)' }}>Command Center</div>
            </div>
          </div>

          <h1 className="text-3xl font-black mb-3 leading-tight" style={{ color: 'var(--cwm-text)' }}>
            GTSU<br />Command Center
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--cwm-text-muted)' }}>
            AI-powered diagnostics and prognostics for GTSU engine health — real-time monitoring, predictive maintenance, and operational intelligence.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-4">
          {[
            { icon: '📊', label: 'Live Telemetry Dashboard', desc: 'Real-time TGT, N1/N2, P2/P1 and health KPIs' },
            { icon: '🧠', label: 'PHM & Prognostics',        desc: 'RUL prediction, hot-start risk, virtual sensor diagnostics' },
            { icon: '⚡', label: 'Start Sequence Sim',       desc: 'Animated light-up timeline with AI advisories' },
            { icon: '🔩', label: 'FMEA Analysis',             desc: 'Start-cycle failure modes and RPN scoring' },
          ].map(f => (
            <div key={f.label} className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: 'var(--cwm-accent-bg)', border: '1px solid var(--cwm-accent-border)' }}>{f.icon}</div>
              <div>
                <div className="text-xs font-semibold" style={{ color: 'var(--cwm-text)' }}>{f.label}</div>
                <div className="text-[11px]" style={{ color: 'var(--cwm-text-faint)' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom status strip */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--cwm-success)' }} />
          <span className="text-[10px]" style={{ color: 'var(--cwm-text-faint)' }}>All systems operational · HAL DRISHTI</span>
        </div>
      </div>

      {/* ── Right: login form ─── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">

        {/* Theme toggle */}
        {onThemeToggle && (
          <button onClick={onThemeToggle} className="icon-btn absolute top-6 right-6" title="Toggle theme">
            {theme === 'dark'
              ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0L16.95 7.05M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1012 21a8.962 8.962 0 008.354-5.646z" /></svg>
            }
          </button>
        )}

        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-xl" style={{ background: 'var(--cwm-accent)' }}>G</div>
            <div>
              <div className="font-bold" style={{ color: 'var(--cwm-text)' }}>GTSU Command Center</div>
              <div className="text-xs" style={{ color: 'var(--cwm-text-faint)' }}>GTSU Platform</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--cwm-text)' }}>Sign in</h2>
          <p className="text-sm mb-8" style={{ color: 'var(--cwm-text-muted)' }}>Enter your credentials to access the command center</p>

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--cwm-text-muted)' }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ background: 'var(--cwm-surface-soft)', border: '1px solid var(--cwm-border)', color: 'var(--cwm-text)' }}
                autoComplete="username"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--cwm-text-muted)' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ background: 'var(--cwm-surface-soft)', border: '1px solid var(--cwm-border)', color: 'var(--cwm-text)' }}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--cwm-danger-bg)', color: 'var(--cwm-danger)', border: '1px solid var(--cwm-danger-border)' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="cwm-btn w-full py-2.5 text-sm font-semibold rounded-lg"
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-[10px] mt-8" style={{ color: 'var(--cwm-text-faint)' }}>
            GTSU Command Center · Secured access only
          </p>
        </div>
      </div>
    </div>
  );
}
