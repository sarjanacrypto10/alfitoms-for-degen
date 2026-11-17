import React, { useEffect, useState } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import type { CollectorStatusLabel, TokenRecord } from '../types/domain';
import { api } from '../lib/api';
import {
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
} from '../components/TokenStatusElements';

interface LiveRadarViewProps {
  collectorStatus: CollectorStatusLabel;
  streamTick: number;
  onSelectToken: (mint: string) => void;
  onInspectMint: (mint: string) => void;
}

export const LiveRadarView: React.FC<LiveRadarViewProps> = ({
  collectorStatus,
  streamTick,
  onSelectToken,
  onInspectMint,
}) => {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('all');
  const [sortBy, setSortBy] = useState<'detectedAt' | 'volume' | 'liquidity'>('detectedAt');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualMint, setManualMint] = useState('');

  const loadTokens = async () => {
    try {
      setError(null);
      const res = await api.getTokens({
        q,
        source,
        sortBy,
        sortDir,
        page,
        pageSize: 25,
      });
      setTokens(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch token radar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTokens();
  }, [q, source, sortBy, sortDir, page, streamTick]);

  const toggleSort = (col: 'detectedAt' | 'volume' | 'liquidity') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-[#E4E7EC]">Live Token Radar</h1>
            <CollectorStatusLabelText status={collectorStatus} />
          </div>
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Real-time Solana Mainnet discovery table. Showing {total.toLocaleString()} captured token records.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualMint.trim()) {
              onInspectMint(manualMint.trim());
              setManualMint('');
            }
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={manualMint}
            onChange={(e) => setManualMint(e.target.value)}
            placeholder="Scan any Solana mint..."
            className="w-56 sm:w-64 bg-[#13161C] border border-[#E4E7EC]/12 focus:border-[#D4AF37]/50 rounded px-3 py-1.5 text-xs font-mono-num text-[#E4E7EC] placeholder-[#646D7D] focus:outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#E5C76B] text-[#060709] font-semibold text-xs rounded whitespace-nowrap cursor-pointer"
          >
            Inspect Mint
          </button>
        </form>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="terminal-panel rounded p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex items-center flex-1 bg-[#13161C] border border-[#E4E7EC]/10 rounded px-3 py-1.5">
          <Search className="w-3.5 h-3.5 text-[#646D7D] mr-2 shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by token name, symbol, or mint address..."
            className="w-full bg-transparent text-xs text-[#E4E7EC] placeholder-[#646D7D] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
            className="bg-[#13161C] border border-[#E4E7EC]/10 rounded px-2.5 py-1.5 text-xs text-[#E4E7EC] focus:outline-none"
          >
            <option value="all">All Sources</option>
            <option value="pumpportal-create">Pump.fun Launch</option>
            <option value="pumpportal-migration">Pump.fun Migration</option>
            <option value="migrated">All Migrated</option>
            <option value="manual-inspect">Manual Inspect</option>
            <option value="helius-stream">Helius Stream</option>
          </select>

          <button
            type="button"
            onClick={() => toggleSort('detectedAt')}
            className={`px-2.5 py-1.5 rounded text-xs border flex items-center gap-1 cursor-pointer ${
              sortBy === 'detectedAt'
                ? 'bg-[#13161C] border-[#D4AF37]/40 text-[#E5C76B]'
                : 'border-[#E4E7EC]/10 text-[#9AA3B2]'
            }`}
          >
            <span>Time</span>
            <ArrowDownUp className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => toggleSort('volume')}
            className={`px-2.5 py-1.5 rounded text-xs border flex items-center gap-1 cursor-pointer ${
              sortBy === 'volume'
                ? 'bg-[#13161C] border-[#D4AF37]/40 text-[#E5C76B]'
                : 'border-[#E4E7EC]/10 text-[#9AA3B2]'
            }`}
          >
            <span>Volume</span>
            <ArrowDownUp className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => toggleSort('liquidity')}
            className={`px-2.5 py-1.5 rounded text-xs border flex items-center gap-1 cursor-pointer ${
              sortBy === 'liquidity'
                ? 'bg-[#13161C] border-[#D4AF37]/40 text-[#E5C76B]'
                : 'border-[#E4E7EC]/10 text-[#9AA3B2]'
            }`}
          >
            <span>Liquidity</span>
            <ArrowDownUp className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => void loadTokens()}
            aria-label="Refresh radar"
            className="p-1.5 rounded border border-[#E4E7EC]/10 text-[#9AA3B2] hover:text-[#E5C76B] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="terminal-panel rounded p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* 10-Column Institutional Data Table */}
      <div className="terminal-panel rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1020px]">
            <thead>
              <tr className="border-b border-[#E4E7EC]/8 text-[11px] text-[#646D7D]">
                <th className="py-2.5 px-4 font-medium">Token Name</th>
                <th className="py-2.5 px-3 font-medium">Symbol</th>
                <th className="py-2.5 px-3 font-medium">Mint Address</th>
                <th className="py-2.5 px-3 font-medium">Creator</th>
                <th className="py-2.5 px-3 font-medium">Source</th>
                <th className="py-2.5 px-3 font-medium">Detected</th>
                <th className="py-2.5 px-3 font-medium text-right">Market Cap</th>
                <th className="py-2.5 px-3 font-medium text-right">Liquidity</th>
                <th className="py-2.5 px-3 font-medium text-right">Volume 24h</th>
                <th className="py-2.5 px-3 font-medium text-right">Risk Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]/6 text-xs">
              {loading && tokens.length === 0 ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={11} className="py-3 px-4">
                      <div className="h-4 bg-[#13161C] rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : tokens.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 px-4 text-center text-[#9AA3B2]">
                    No tokens match current filters. Live collector status: {collectorStatus}.
                  </td>
                </tr>
              ) : (
                tokens.map((t) => (
                  <tr
                    key={t.mint}
                    onClick={() => onSelectToken(t.mint)}
                    className="hover:bg-[#13161C] transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-medium text-[#E4E7EC]">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[140px]">{t.name}</span>
                        {t.isDemo && (
                          <span className="text-[10px] font-mono-num text-[#E5C76B]">
                            DEMO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono-num text-[#E5C76B]">
                      {t.symbol}
                    </td>
                    <td className="py-2.5 px-3">
                      <CopyAddress address={t.mint} />
                    </td>
                    <td className="py-2.5 px-3">
                      <CopyAddress address={t.creatorWallet} />
                    </td>
                    <td className="py-2.5 px-3 text-[#9AA3B2] whitespace-nowrap">
                      {formatSourceLabel(t.source)}
                    </td>
                    <td className="py-2.5 px-3 font-mono-num text-[#9AA3B2] whitespace-nowrap">
                      {formatTimeAgo(t.detectedAt)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC] whitespace-nowrap">
                      {t.marketCapUsd !== null
                        ? formatUsd(t.marketCapUsd)
                        : t.marketCapSol !== null
                          ? formatSol(t.marketCapSol)
                          : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC] whitespace-nowrap">
                      {formatUsd(t.liquidityUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC] whitespace-nowrap">
                      {formatUsd(t.volume24hUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <RiskLabelText category={t.riskCategory} score={t.riskScore} />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <ExplorerLinks mint={t.mint} compact />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-[#E4E7EC]/8 flex items-center justify-between text-xs text-[#9AA3B2]">
          <span className="font-mono-num">
            Page {page} of {totalPages} · {total} total
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded border border-[#E4E7EC]/10 disabled:opacity-40 hover:border-[#D4AF37]/40 cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded border border-[#E4E7EC]/10 disabled:opacity-40 hover:border-[#D4AF37]/40 cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
