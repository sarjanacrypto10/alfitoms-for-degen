import React from 'react';
import { ArrowUpRight, RefreshCw, ShieldAlert } from 'lucide-react';
import type { NavSection, OverviewResponse } from '../types/domain';
import {
  formatPriceUsd,
  formatSol,
  formatSourceLabel,
  formatTimeAgo,
  formatUsd,
} from '../lib/format';
import {
  CollectorStatusLabelText,
  CopyAddress,
  ExplorerLinks,
  RiskLabelText,
  StageText,
} from '../components/TokenStatusElements';

interface OverviewViewProps {
  data: OverviewResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectToken: (mint: string) => void;
  onNavigate: (section: NavSection) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  data,
  loading,
  error,
  onRefresh,
  onSelectToken,
  onNavigate,
}) => {
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 terminal-panel rounded animate-pulse" />
          ))}
        </div>
        <div className="h-64 terminal-panel rounded animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="terminal-panel rounded p-6 text-sm text-red-400 flex items-center justify-between">
        <span>Failed to load overview telemetry: {error}</span>
        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1.5 bg-[#13161C] border border-[#E4E7EC]/15 rounded text-xs text-[#E4E7EC] cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { metrics, collectorStatus, latestTokens, recentMigrations, trendingTokens, recentAlerts, recentLargeEvents } = data;

  return (
    <div className="space-y-6">
      {/* Header & Active Scope Notice */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#E4E7EC]">
            Solana Mainnet Intelligence Overview
          </h1>
          <p className="text-xs text-[#9AA3B2] mt-1">
            Discover Early · Analyze Deeper · Trade Smarter — Real-time server-side collector monitoring Solana Mainnet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CollectorStatusLabelText
            status={collectorStatus.pumpportal.status}
            label="PumpPortal"
          />
          <span className="text-[#646D7D]" aria-hidden="true">·</span>
          <CollectorStatusLabelText
            status={collectorStatus.helius.enabled ? collectorStatus.helius.status : 'DISCONNECTED'}
            label="Helius"
          />
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 bg-[#13161C] border border-[#E4E7EC]/12 hover:border-[#D4AF37]/40 rounded text-xs font-medium text-[#E4E7EC] flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Monitoring Transparency Bar */}
      <div className="terminal-panel rounded px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="text-[#9AA3B2]">
          <span className="text-[#E5C76B] font-medium">Active Monitoring Scope: </span>
          {collectorStatus.activeMonitoringScope.join(' · ')}
        </div>
        <div className="font-mono-num text-[#646D7D] shrink-0">
          Last Event: {formatTimeAgo(collectorStatus.pumpportal.lastEventAt)}
        </div>
      </div>

      {/* 6 Institutional KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">Total Detected</div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-[#E4E7EC]">
            {metrics.totalDetectedTokens.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#646D7D]">Solana Mainnet</div>
        </div>

        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">Detected Today</div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-[#E5C76B]">
            {metrics.tokensDetectedToday.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#646D7D]">UTC Day</div>
        </div>

        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">New Launches</div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-[#E4E7EC]">
            {metrics.newLaunches.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#646D7D]">Pump.fun Create</div>
        </div>

        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">Migrated Tokens</div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-emerald-400">
            {metrics.migratedTokens.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#646D7D]">Graduated Pools</div>
        </div>

        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">Monitored Volume</div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-[#E4E7EC]">
            {metrics.totalMonitoredVolumeUsd > 0
              ? formatUsd(metrics.totalMonitoredVolumeUsd)
              : 'N/A'}
          </div>
          <div className="mt-1 text-[11px] text-[#646D7D]">24h Indexed</div>
        </div>

        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">High-Risk Alerts</div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-red-400">
            {metrics.highRiskAlerts.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#646D7D]">Flagged Scans</div>
        </div>
      </div>

      {/* Primary Split: Latest Detected Tokens + Recent Migrations */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Latest Detected Tokens (2 columns wide) */}
        <section className="xl:col-span-2 terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#E4E7EC]">
                Latest Detected Tokens
              </h2>
              <p className="text-xs text-[#646D7D]">
                Newest Solana detections ordered by event timestamp
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('radar')}
              className="text-xs text-[#D4AF37] hover:text-[#E5C76B] flex items-center gap-1 cursor-pointer"
            >
              <span>Open Full Radar</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {latestTokens.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#9AA3B2] space-y-2">
              <p>
                Waiting for live Solana token events from PumpPortal WebSocket ({collectorStatus.pumpportal.status}).
              </p>
              <p className="text-[#646D7D]">
                You can also inspect any Solana mint address using the top search bar or toggle DEMO inspection in Settings.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E4E7EC]/8 text-[11px] text-[#646D7D]">
                    <th className="py-2.5 px-4 font-medium">Token</th>
                    <th className="py-2.5 px-3 font-medium">Mint</th>
                    <th className="py-2.5 px-3 font-medium">Source</th>
                    <th className="py-2.5 px-3 font-medium text-right">MCap / Curve</th>
                    <th className="py-2.5 px-3 font-medium text-right">Risk</th>
                    <th className="py-2.5 px-4 font-medium text-right">Detected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E7EC]/6 text-xs">
                  {latestTokens.slice(0, 10).map((t) => (
                    <tr
                      key={t.mint}
                      onClick={() => onSelectToken(t.mint)}
                      className="hover:bg-[#13161C] transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[#E4E7EC] flex items-center gap-2">
                          <span className="truncate max-w-[140px]">{t.name}</span>
                          {t.isDemo && (
                            <span className="text-[10px] font-mono-num text-[#E5C76B]">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono-num text-[#646D7D]">
                          {t.symbol} · <StageText stage={t.verificationStage} />
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <CopyAddress address={t.mint} />
                      </td>
                      <td className="py-2.5 px-3 text-[#9AA3B2] whitespace-nowrap">
                        {formatSourceLabel(t.source)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC] whitespace-nowrap">
                        {t.marketCapUsd !== null
                          ? formatUsd(t.marketCapUsd)
                          : t.marketCapSol !== null
                            ? formatSol(t.marketCapSol)
                            : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <RiskLabelText category={t.riskCategory} score={t.riskScore} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num text-[#9AA3B2] whitespace-nowrap">
                        {formatTimeAgo(t.detectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent Migrations */}
        <section className="terminal-panel rounded overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#E4E7EC]">
                Recent Migrations
              </h2>
              <p className="text-xs text-[#646D7D]">
                Bonding curve graduations
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pumpfun')}
              className="text-xs text-[#D4AF37] hover:text-[#E5C76B] cursor-pointer"
            >
              Scanner
            </button>
          </div>

          <div className="divide-y divide-[#E4E7EC]/6 flex-1">
            {recentMigrations.length === 0 ? (
              <div className="p-6 text-xs text-[#646D7D] text-center">
                No Pump.fun migration events captured in this session yet.
              </div>
            ) : (
              recentMigrations.slice(0, 6).map((t) => (
                <div
                  key={t.mint}
                  onClick={() => onSelectToken(t.mint)}
                  className="px-4 py-3 hover:bg-[#13161C] transition-colors cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#E4E7EC] truncate">
                      {t.symbol} · {t.name}
                    </div>
                    <div className="text-[11px] font-mono-num text-[#646D7D] mt-0.5">
                      Pool: {t.migrationPool ?? 'AMM'} · {formatTimeAgo(t.migratedAt ?? t.detectedAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono-num text-[#E5C76B]">
                      {t.liquidityUsd !== null ? formatUsd(t.liquidityUsd) : 'N/A'}
                    </div>
                    <ExplorerLinks mint={t.mint} compact />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Bottom 3-Column Strip: Trending, Recent Activity/Whale Events, Latest Risk Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Enriched Trending Tokens */}
        <section className="terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">Trending Tokens</h2>
            <button
              type="button"
              onClick={() => onNavigate('trending')}
              className="text-xs text-[#D4AF37] hover:text-[#E5C76B] cursor-pointer"
            >
              Rankings
            </button>
          </div>
          <div className="divide-y divide-[#E4E7EC]/6">
            {trendingTokens.length === 0 ? (
              <div className="p-5 text-xs text-[#646D7D]">
                No enriched market tokens cached yet. Visit Trending Tokens to fetch live DexScreener Solana rankings.
              </div>
            ) : (
              trendingTokens.slice(0, 5).map((t) => (
                <div
                  key={t.mint}
                  onClick={() => onSelectToken(t.mint)}
                  className="px-4 py-2.5 hover:bg-[#13161C] cursor-pointer flex items-center justify-between text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[#E4E7EC] truncate">{t.symbol}</div>
                    <div className="text-[11px] font-mono-num text-[#646D7D]">
                      Price: {formatPriceUsd(t.priceUsd)}
                    </div>
                  </div>
                  <div className="text-right font-mono-num">
                    <div className="text-[#E4E7EC]">{formatUsd(t.volume24hUsd)}</div>
                    <div className="text-[11px] text-[#646D7D]">
                      Liq {formatUsd(t.liquidityUsd)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Recent Captured Chain Events */}
        <section className="terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Recent On-Chain Events
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('wallets')}
              className="text-xs text-[#D4AF37] hover:text-[#E5C76B] cursor-pointer"
            >
              Wallet Intel
            </button>
          </div>
          <div className="divide-y divide-[#E4E7EC]/6">
            {recentLargeEvents.length === 0 ? (
              <div className="p-5 text-xs text-[#646D7D]">
                No live transaction events recorded yet.
              </div>
            ) : (
              recentLargeEvents.slice(0, 5).map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => onSelectToken(ev.mint)}
                  className="px-4 py-2.5 hover:bg-[#13161C] cursor-pointer flex items-center justify-between text-xs gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-mono-num text-[#E4E7EC] truncate">
                      {ev.eventType.toUpperCase()} · {ev.mint.slice(0, 8)}...
                    </div>
                    <div className="text-[11px] text-[#646D7D] truncate">
                      Dev: {ev.creatorWallet ? `${ev.creatorWallet.slice(0, 6)}...` : 'N/A'}
                    </div>
                  </div>
                  <span className="font-mono-num text-[11px] text-[#9AA3B2] shrink-0">
                    {formatTimeAgo(ev.detectedAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Latest Risk Alerts */}
        <section className="terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">Latest Risk Alerts</h2>
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="text-xs text-[#D4AF37] hover:text-[#E5C76B] cursor-pointer"
            >
              Alert Center
            </button>
          </div>
          <div className="divide-y divide-[#E4E7EC]/6">
            {recentAlerts.length === 0 ? (
              <div className="p-5 text-xs text-[#646D7D] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#646D7D] shrink-0" />
                <span>No alerts triggered yet. Configure thresholds in Alerts or Settings.</span>
              </div>
            ) : (
              recentAlerts.slice(0, 5).map((al) => (
                <div
                  key={al.id}
                  onClick={() => onSelectToken(al.mint)}
                  className="px-4 py-2.5 hover:bg-[#13161C] cursor-pointer space-y-0.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-medium truncate ${
                        al.severity === 'critical'
                          ? 'text-red-400'
                          : al.severity === 'warning'
                            ? 'text-amber-400'
                            : 'text-[#E5C76B]'
                      }`}
                    >
                      {al.title}
                    </span>
                    <span className="font-mono-num text-[11px] text-[#646D7D] shrink-0">
                      {formatTimeAgo(al.createdAt)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#9AA3B2] truncate">{al.message}</div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
