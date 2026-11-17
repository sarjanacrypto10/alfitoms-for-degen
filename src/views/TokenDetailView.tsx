import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { TokenDetailResponse } from '../types/domain';
import { api } from '../lib/api';
import {
  formatCompact,
  formatPct,
  formatPriceUsd,
  formatSol,
  formatSourceLabel,
  formatUsd,
  formatUtcTime,
} from '../lib/format';
import {
  CopyAddress,
  ExplorerLinks,
  RiskLabelText,
  StageText,
} from '../components/TokenStatusElements';
import {
  BuySellRatioBar,
  HolderDistributionBars,
  SnapshotHistoryChart,
} from '../components/charts/TerminalCharts';

interface TokenDetailViewProps {
  mint: string;
  onBack: () => void;
}

export const TokenDetailView: React.FC<TokenDetailViewProps> = ({
  mint,
  onBack,
}) => {
  const [detail, setDetail] = useState<TokenDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<'priceUsd' | 'liquidityUsd' | 'volume24hUsd'>(
    'priceUsd'
  );
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async (autoInspectIfMissing = true) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTokenDetail(mint);
      setDetail(res);
    } catch {
      if (autoInspectIfMissing) {
        try {
          await api.inspectMint(mint);
          const res = await api.getTokenDetail(mint);
          setDetail(res);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unable to load token dossier.');
        }
      } else {
        setError('Token record not found.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail(true);
  }, [mint]);

  const handleEnrich = async () => {
    setBusyAction('enrich');
    setError(null);
    try {
      await api.enrichToken(mint);
      await loadDetail(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DexScreener enrichment failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAnalyze = async () => {
    setBusyAction('analyze');
    setError(null);
    try {
      await api.analyzeToken(mint);
      await loadDetail(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'On-chain risk scan failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleAiBrief = async () => {
    setBusyAction('ai');
    setError(null);
    try {
      await api.generateAiBrief(mint);
      await loadDetail(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gemini brief generation failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleWatchlistToggle = async () => {
    if (!detail) return;
    setBusyAction('watchlist');
    try {
      if (detail.inWatchlist) {
        await api.removeFromWatchlist(mint);
      } else {
        await api.addToWatchlist({
          mint,
          symbol: detail.token.symbol,
          name: detail.token.name,
        });
      }
      await loadDetail(false);
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !detail) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[#9AA3B2] hover:text-[#E4E7EC] flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        <div className="h-44 terminal-panel rounded animate-pulse" />
        <div className="h-64 terminal-panel rounded animate-pulse" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-[#9AA3B2] hover:text-[#E4E7EC] flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        <div className="terminal-panel rounded p-6 text-xs text-red-400">{error}</div>
      </div>
    );
  }

  if (!detail) return null;

  const { token, events, marketSnapshots, walletAnalytics, riskAssessment, inWatchlist } =
    detail;

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-[#9AA3B2] hover:text-[#E5C76B] flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Terminal</span>
          </button>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-[#E4E7EC]">
              {token.name} <span className="text-[#E5C76B] font-mono-num">({token.symbol})</span>
            </h1>
            <StageText stage={token.verificationStage} />
            {token.isDemo && (
              <span className="font-mono-num text-xs text-[#E5C76B]">DEMO</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[#9AA3B2]">
            <span>Mint: <CopyAddress address={token.mint} head={6} tail={6} /></span>
            <span aria-hidden="true">·</span>
            <span>Creator: <CopyAddress address={token.creatorWallet} head={6} tail={6} /></span>
            <span aria-hidden="true">·</span>
            <span>{formatSourceLabel(token.source)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">Detected {formatUtcTime(token.detectedAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleEnrich()}
            className="px-3 py-1.5 bg-[#13161C] border border-[#E4E7EC]/15 hover:border-[#D4AF37]/40 rounded text-xs text-[#E4E7EC] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'enrich' ? 'animate-spin' : ''}`} />
            <span>Enrich Market</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleAnalyze()}
            className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#E5C76B] text-[#060709] font-semibold rounded text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{busyAction === 'analyze' ? 'Scanning...' : 'Run On-Chain Scan'}</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleWatchlistToggle()}
            className={`px-3 py-1.5 rounded text-xs border flex items-center gap-1.5 cursor-pointer ${
              inWatchlist
                ? 'bg-[#D4AF37]/15 border-[#D4AF37]/50 text-[#E5C76B]'
                : 'bg-[#13161C] border-[#E4E7EC]/15 text-[#E4E7EC]'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>{inWatchlist ? 'Saved' : 'Watchlist'}</span>
          </button>

          <ExplorerLinks mint={token.mint} />
        </div>
      </div>

      {error && (
        <div className="terminal-panel rounded p-3 text-xs text-red-400">{error}</div>
      )}

      {/* Market Statistics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="terminal-panel rounded p-3.5">
          <div className="text-[11px] text-[#646D7D]">Price USD</div>
          <div className="mt-1 text-base font-semibold font-mono-num text-[#E4E7EC]">
            {formatPriceUsd(token.priceUsd)}
          </div>
          <div
            className={`mt-0.5 text-[11px] font-mono-num ${
              token.priceChange1h === null
                ? 'text-[#646D7D]'
                : token.priceChange1h >= 0
                  ? 'text-emerald-400'
                  : 'text-red-400'
            }`}
          >
            1h: {formatPct(token.priceChange1h)}
          </div>
        </div>

        <div className="terminal-panel rounded p-3.5">
          <div className="text-[11px] text-[#646D7D]">Market Cap / FDV</div>
          <div className="mt-1 text-base font-semibold font-mono-num text-[#E4E7EC]">
            {token.marketCapUsd !== null
              ? formatUsd(token.marketCapUsd)
              : token.fdvUsd !== null
                ? formatUsd(token.fdvUsd)
                : token.marketCapSol !== null
                  ? formatSol(token.marketCapSol)
                  : 'N/A'}
          </div>
          <div className="mt-0.5 text-[11px] font-mono-num text-[#646D7D]">
            FDV: {formatUsd(token.fdvUsd)}
          </div>
        </div>

        <div className="terminal-panel rounded p-3.5">
          <div className="text-[11px] text-[#646D7D]">Liquidity USD</div>
          <div className="mt-1 text-base font-semibold font-mono-num text-[#E5C76B]">
            {formatUsd(token.liquidityUsd)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#646D7D]">
            DEX: {token.dexId ?? 'Bonding Curve'}
          </div>
        </div>

        <div className="terminal-panel rounded p-3.5">
          <div className="text-[11px] text-[#646D7D]">Volume 24h</div>
          <div className="mt-1 text-base font-semibold font-mono-num text-[#E4E7EC]">
            {formatUsd(token.volume24hUsd)}
          </div>
          <div className="mt-0.5 text-[11px] font-mono-num text-[#646D7D]">
            1h: {formatUsd(token.volume1hUsd)}
          </div>
        </div>

        <div className="terminal-panel rounded p-3.5">
          <div className="text-[11px] text-[#646D7D]">Total Supply</div>
          <div className="mt-1 text-base font-semibold font-mono-num text-[#E4E7EC]">
            {formatCompact(walletAnalytics?.supplyUi)}
          </div>
          <div className="mt-0.5 text-[11px] text-[#646D7D]">
            {walletAnalytics?.tokenProgram ?? 'Solana SPL'}
          </div>
        </div>

        <div className="terminal-panel rounded p-3.5">
          <div className="text-[11px] text-[#646D7D]">Risk Score</div>
          <div className="mt-1 text-base font-semibold">
            <RiskLabelText
              category={riskAssessment?.category ?? token.riskCategory}
              score={riskAssessment?.score ?? token.riskScore}
            />
          </div>
          <div className="mt-0.5 text-[11px] text-[#646D7D]">
            LP: {riskAssessment?.lpStatus ?? 'unverified'}
          </div>
        </div>
      </div>

      {/* Price / Liquidity / Volume History + Buy/Sell Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 terminal-panel rounded p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#E4E7EC]">
                Market Snapshot History
              </h2>
              <p className="text-[11px] text-[#646D7D]">
                Recorded from DexScreener snapshots ({marketSnapshots.length} captured)
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#13161C] rounded text-xs">
              {(
                [
                  { id: 'priceUsd', label: 'Price' },
                  { id: 'liquidityUsd', label: 'Liquidity' },
                  { id: 'volume24hUsd', label: 'Volume' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartMetric(tab.id)}
                  className={`px-2.5 py-1 rounded cursor-pointer ${
                    chartMetric === tab.id
                      ? 'bg-[#D4AF37] text-[#060709] font-semibold'
                      : 'text-[#9AA3B2]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <SnapshotHistoryChart snapshots={marketSnapshots} metric={chartMetric} />
        </div>

        <div className="terminal-panel rounded p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[#E4E7EC]">Trading Transactions</h2>
          <BuySellRatioBar
            label="24h"
            buys={token.buys24h}
            sells={token.sells24h}
          />
          <BuySellRatioBar
            label="1h"
            buys={token.buys1h}
            sells={token.sells1h}
          />
          <div className="pt-3 border-t border-[#E4E7EC]/8 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#646D7D]">Curve SOL</span>
              <span className="font-mono-num text-[#E4E7EC]">
                {formatSol(token.vSolInBondingCurve)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#646D7D]">Initial Dev Buy</span>
              <span className="font-mono-num text-[#E4E7EC]">
                {formatSol(token.initialBuySol)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#646D7D]">Last Enriched</span>
              <span className="font-mono-num text-[#9AA3B2]">
                {token.lastEnrichedAt ? formatUtcTime(token.lastEnrichedAt).slice(11, 19) : 'Never'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Assessment & Holder Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Deterministic Risk Assessment
            </h2>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleAiBrief()}
              className="px-2.5 py-1 bg-[#13161C] border border-[#D4AF37]/30 hover:border-[#D4AF37] rounded text-xs text-[#E5C76B] flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" />
              <span>{busyAction === 'ai' ? 'Generating...' : 'Optional AI Brief'}</span>
            </button>
          </div>

          {!riskAssessment ? (
            <div className="p-6 text-xs text-[#9AA3B2] flex items-center justify-between">
              <span>No on-chain risk assessment run yet for this mint.</span>
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                className="px-3 py-1.5 bg-[#D4AF37] text-[#060709] font-semibold rounded cursor-pointer"
              >
                Scan Now
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#E4E7EC]/6">
              {riskAssessment.findings.map((f) => (
                <div
                  key={f.id}
                  className="px-4 py-3 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div
                      className={`font-medium ${
                        f.status === 'critical'
                          ? 'text-red-400'
                          : f.status === 'warning'
                            ? 'text-amber-400'
                            : f.status === 'pass'
                              ? 'text-emerald-400'
                              : 'text-[#9AA3B2]'
                      }`}
                    >
                      [{f.status.toUpperCase()}] {f.label}
                    </div>
                    <p className="text-[#9AA3B2] mt-0.5">{f.detail}</p>
                  </div>
                  {f.evidenceUrl && (
                    <a
                      href={f.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#E5C76B] hover:underline shrink-0 flex items-center gap-1"
                    >
                      <span>Proof</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
              {riskAssessment.aiSummary && (
                <div className="p-4 bg-[#13161C]/60 space-y-1 text-xs">
                  <div className="font-semibold text-[#E5C76B]">
                    AI Research Brief (Gemini)
                  </div>
                  <p className="text-[#E4E7EC] leading-relaxed">
                    {riskAssessment.aiSummary}
                  </p>
                </div>
              )}
              <div className="p-3 bg-[#060709]/40 text-[11px] text-[#646D7D]">
                {riskAssessment.disclaimer}
              </div>
            </div>
          )}
        </div>

        <div className="terminal-panel rounded p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Top Holder Distribution
            </h2>
            <p className="text-[11px] text-[#646D7D]">
              Top 10 concentration:{' '}
              <span className="font-mono-num text-[#E5C76B]">
                {walletAnalytics?.top10Pct !== null && walletAnalytics?.top10Pct !== undefined
                  ? `${walletAnalytics.top10Pct}%`
                  : 'N/A'}
              </span>
            </p>
          </div>
          <HolderDistributionBars holders={walletAnalytics?.topHolders ?? []} />
        </div>
      </div>

      {/* Transaction & Raw Event Evidence */}
      <div className="terminal-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E4E7EC]/8">
          <h2 className="text-sm font-semibold text-[#E4E7EC]">
            Captured Collector Events & Raw Evidence ({events.length})
          </h2>
        </div>
        <div className="divide-y divide-[#E4E7EC]/6 text-xs">
          {events.length === 0 ? (
            <div className="p-4 text-[#646D7D]">No raw collector events saved.</div>
          ) : (
            events.slice(0, 8).map((ev) => (
              <div key={ev.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono-num text-[#E5C76B]">
                    {ev.eventType.toUpperCase()} · {formatUtcTime(ev.detectedAt)}
                  </span>
                  <a
                    href={`https://solscan.io/tx/${ev.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono-num text-[#9AA3B2] hover:text-[#E5C76B] flex items-center gap-1"
                  >
                    <span>Tx: {ev.signature.slice(0, 14)}...</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <pre className="p-2.5 bg-[#060709] border border-[#E4E7EC]/8 rounded text-[11px] font-mono-num text-[#9AA3B2] overflow-x-auto">
                  {JSON.stringify(ev.rawPayload, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
