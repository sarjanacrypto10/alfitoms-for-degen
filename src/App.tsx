import { useCallback, useEffect, useState } from 'react';
import type {
  CollectorStatusState,
  NavSection,
  OverviewResponse,
} from './types/domain';
import { api, buildApiUrl } from './lib/api';
import { Layout } from './components/Layout';
import { OverviewView } from './views/OverviewView';
import { LiveRadarView } from './views/LiveRadarView';
import { PumpFunScannerView } from './views/PumpFunScannerView';
import { TrendingTokensView } from './views/TrendingTokensView';
import { MarketAnalyticsView } from './views/MarketAnalyticsView';
import { WalletIntelligenceView } from './views/WalletIntelligenceView';
import { RiskScannerView } from './views/RiskScannerView';
import { WatchlistView } from './views/WatchlistView';
import { AlertsView } from './views/AlertsView';
import { SettingsView } from './views/SettingsView';
import { TokenDetailView } from './views/TokenDetailView';

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [selectedTokenMint, setSelectedTokenMint] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatusState | null>(null);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const [streamTick, setStreamTick] = useState(0);

  const loadOverview = useCallback(async () => {
    try {
      setOverviewError(null);
      const [ov, setRes, alertRes] = await Promise.all([
        api.getOverview(),
        api.getSettings(),
        api.getAlerts(),
      ]);
      setOverview(ov);
      setCollectorStatus(ov.collectorStatus);
      setDemoMode(setRes.settings.demoSampleEnabled);
      setUnreadAlertsCount(alertRes.alerts.filter((a) => !a.read).length);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Failed loading dashboard');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Subscribe to Server-Sent Events (/api/stream) for real-time updates on stateful workers;
  // in serverless deployments, close SSE after initial snapshot and poll cleanly every 30s.
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    let isServerlessStream = false;

    const connectSse = () => {
      if (closed || isServerlessStream) return;
      es = new EventSource(buildApiUrl('/api/stream'));

      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data) as {
            type?: string;
            status?: CollectorStatusState;
            serverless?: boolean;
          };
          if (payload.type === 'snapshot' || payload.type === 'collector:status') {
            if (payload.status) {
              setCollectorStatus(payload.status);
            }
            if (payload.serverless) {
              isServerlessStream = true;
              es?.close();
              if (!pollTimer) {
                pollTimer = setInterval(() => {
                  void loadOverview();
                }, 30_000);
              }
            }
          } else if (
            payload.type === 'token:detected' ||
            payload.type === 'token:updated' ||
            payload.type === 'alert:new'
          ) {
            setStreamTick((t) => t + 1);
            void loadOverview();
          }
        } catch {
          // Ignore malformed SSE event
        }
      };

      es.onerror = () => {
        es?.close();
        if (!closed && !isServerlessStream && !retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            connectSse();
          }, 5000);
        }
      };
    };

    connectSse();

    return () => {
      closed = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [loadOverview]);

  const handleNavigate = (section: NavSection) => {
    setSelectedTokenMint(null);
    setActiveSection(section);
  };

  const handleSelectToken = (mint: string) => {
    setSelectedTokenMint(mint);
  };

  const handleInspectMint = (mint: string) => {
    setSelectedTokenMint(mint);
  };

  const ppStatus = collectorStatus?.pumpportal.status ?? 'CONNECTING';
  const effectiveStatus = demoMode && ppStatus !== 'LIVE' ? 'DEMO' : ppStatus;

  return (
    <Layout
      activeSection={activeSection}
      selectedTokenMint={selectedTokenMint}
      onNavigate={handleNavigate}
      onInspectMint={handleInspectMint}
      collectorStatus={collectorStatus}
      unreadAlertsCount={unreadAlertsCount}
      demoMode={demoMode}
    >
      {selectedTokenMint ? (
        <TokenDetailView
          mint={selectedTokenMint}
          onBack={() => setSelectedTokenMint(null)}
        />
      ) : activeSection === 'overview' ? (
        <OverviewView
          data={overview}
          loading={overviewLoading}
          error={overviewError}
          onRefresh={() => void loadOverview()}
          onSelectToken={handleSelectToken}
          onNavigate={handleNavigate}
        />
      ) : activeSection === 'radar' ? (
        <LiveRadarView
          collectorStatus={effectiveStatus}
          streamTick={streamTick}
          onSelectToken={handleSelectToken}
          onInspectMint={handleInspectMint}
        />
      ) : activeSection === 'pumpfun' ? (
        <PumpFunScannerView
          pumpStatus={collectorStatus?.pumpportal ?? null}
          streamTick={streamTick}
          onSelectToken={handleSelectToken}
        />
      ) : activeSection === 'trending' ? (
        <TrendingTokensView onSelectToken={handleSelectToken} />
      ) : activeSection === 'analytics' ? (
        <MarketAnalyticsView onSelectToken={handleSelectToken} />
      ) : activeSection === 'wallets' ? (
        <WalletIntelligenceView onSelectToken={handleSelectToken} />
      ) : activeSection === 'risk' ? (
        <RiskScannerView onSelectToken={handleSelectToken} />
      ) : activeSection === 'watchlist' ? (
        <WatchlistView onSelectToken={handleSelectToken} />
      ) : activeSection === 'alerts' ? (
        <AlertsView
          streamTick={streamTick}
          onSelectToken={handleSelectToken}
          onAlertsChanged={() => void loadOverview()}
        />
      ) : (
        <SettingsView onStatusUpdated={() => void loadOverview()} />
      )}
    </Layout>
  );
}
