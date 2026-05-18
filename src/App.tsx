import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './services/socket';
import AppLayout from './components/cwm/Layout';
import CWMLoginPage from './pages/CWMLoginPage';
import ProfilePage from './pages/CWMProfile';
import { OverviewPage }          from './pages/OverviewPage';
import { StartSequencePage }     from './pages/StartSequencePage';
import { PHMPage }               from './pages/PHMPage';
import { FMEAPage }              from './pages/FMEAPage';
import { FEAAnalyticsPage }      from './pages/FEAAnalyticsPage';
import { FEAFMEAPage }           from './pages/FEAFMEAPage';
import { VVPage }                from './pages/VVPage';
import { SmartOptimizationPage } from './pages/SmartOptimizationPage';
import LiveTelemetryPage         from './pages/LiveTelemetryPage';
import DigitalTwinPage           from './pages/DigitalTwinPage';
import FaultDetectionPage        from './pages/FaultDetectionPage';
import PhysicsModelPage          from './pages/PhysicsModelPage';
import PrognosticsPage           from './pages/PrognosticsPage';
import MaintenancePage           from './pages/MaintenancePage';
import ScenarioSimulatorPage     from './pages/ScenarioSimulatorPage';
import { useGTSUStore }          from './store/useGTSUStore';

function App() {
  const [user, setUser]   = useState<Record<string, unknown> | null>(() => {
    try { const u = localStorage.getItem('cwm_user'); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('cwm_theme') as 'dark' | 'light') || 'dark'
  );
  const { refreshTelemetry, tickSimulation, simulation } = useGTSUStore();

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('cwm_theme', theme);
  }, [theme]);

  // Refresh live telemetry every 5 s when not simulating
  useEffect(() => {
    if (simulation.isRunning) return;
    const id = setInterval(refreshTelemetry, 5000);
    return () => clearInterval(id);
  }, [simulation.isRunning, refreshTelemetry]);

  // Tick simulation at 1 Hz when running
  useEffect(() => {
    if (!simulation.isRunning) return;
    const id = setInterval(tickSimulation, 1000);
    return () => clearInterval(id);
  }, [simulation.isRunning, tickSimulation]);

  const handleLogin = (userData: Record<string, unknown>, token: string) => {
    localStorage.setItem('cwm_token', token);
    localStorage.setItem('cwm_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('cwm_token');
    localStorage.removeItem('cwm_user');
    setUser(null);
  };

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  if (!user) {
    return (
      <CWMLoginPage onLogin={handleLogin} theme={theme} onThemeToggle={toggleTheme} />
    );
  }

  return (
    <BrowserRouter>
      <SocketProvider>
        <AppLayout user={user} onLogout={handleLogout} theme={theme} onThemeToggle={toggleTheme}>
          <Routes>
            <Route path="/"                    element={<OverviewPage />} />
            <Route path="/start-sequence"      element={<StartSequencePage />} />
            <Route path="/phm"                 element={<PHMPage />} />
            <Route path="/fmea"                element={<FMEAPage />} />
            <Route path="/fea-analytics"       element={<FEAAnalyticsPage />} />
            <Route path="/fea-fmea"            element={<FEAFMEAPage />} />
            <Route path="/vv-compliance"       element={<VVPage />} />
            <Route path="/smart-optimization"  element={<SmartOptimizationPage />} />
            <Route path="/live-telemetry"      element={<LiveTelemetryPage />} />
            <Route path="/digital-twin"        element={<DigitalTwinPage />} />
            <Route path="/fault-detection"     element={<FaultDetectionPage />} />
            <Route path="/physics-model"       element={<PhysicsModelPage />} />
            <Route path="/prognostics"         element={<PrognosticsPage />} />
            <Route path="/maintenance"         element={<MaintenancePage />} />
            <Route path="/scenario-sim"        element={<ScenarioSimulatorPage />} />
            <Route path="/profile"             element={<ProfilePage user={user} onLogout={handleLogout} />} />
            <Route path="*"                    element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </SocketProvider>
    </BrowserRouter>
  );
}

export default App;
