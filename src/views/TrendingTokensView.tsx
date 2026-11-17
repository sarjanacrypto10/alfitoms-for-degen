import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { TokenRecord } from '../types/domain';
import { api } from '../lib/api';
import {
  formatPct,
  formatPriceUsd,
  formatTimeAgo,
  formatUsd,
} from '../lib/format';
import { CopyAddress, RiskLabelText } from '../components/TokenStatusElements';

interface TrendingTokensViewProps {
  onSelectToken: (mint: string) => void;
}

type RankMode = 'dexscreener' | 'volume' | 'liquidity' | 'movers' | 'newest';

export const TrendingTokensView: React.FC<TrendingTokensViewProps> = ({
  onSelectToken,
}) => {
  const [mode, setMode] = useState<RankMode>('dexscreener');
  const [timeframe, setTimeframe] = useState<'5m' | '1h' | '24h'>('1h');
  const [data, setData] = useState<{
    dexScreenerTrending: TokenRecord[];
    fetchedAt: string | null;
    error: string | null;
    byVolume: TokenRecord[];
    byLiquidity: TokenRecord[];
    byPriceMove: TokenRecord[];
    newestLaunches: TokenRecord[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTrending = async (refresh = false) => {
    setLoading(true);
    try {
      const res = await api.getTrending(refresh);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTrending(false);
  }, []);

  const list =
    mode === 'dexscreener'
      ? data?.dexScreenerTrending ?? []
      : mode === 'volume'
        ? data?.byVolume ?? []
        : mode === 'liquidity'
          ? data?.byLiquidity ?? []
          : mode === 'movers'
            ? data?.byPriceMove ?? []
            : data?.newestLaunches ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#E4E7EC]">Trending Tokens</h1>
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Live Solana market rankings powered by DexScreener API & local collector tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-[#13161C] border border-[#E4E7EC]/10 rounded text-xs">
            {(['5m', '1h', '24h'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded font-mono-num cursor-pointer ${
                  timeframe === tf ? 'bg-[#D4AF37] text-[#060709] font-semibold' : 'text-[#9AA3B2]'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadTrending(true)}
            className="px-3 py-1.5 bg-[#13161C] border border-[#E4E7EC]/12 hover:border-[#D4AF37]/40 rounded text-xs text-[#E4E7EC] flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Ranking Selector */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#0D0F13] border border-[#E4E7EC]/8 rounded">
        {(
          [
            { id: 'dexscreener', label: 'DexScreener Solana Top' },
            { id: 'volume', label: 'Highest Volume' },
            { id: 'liquidity', label: 'Highest Liquidity' },
            { id: 'movers', label: 'Largest Price Moves' },
            { id: 'newest', label: 'Newest Launches' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
              mode === tab.id
                ? 'bg-[#13161C] text-[#E5C76B] border border-[#D4AF37]/30'
                : 'text-[#9AA3B2] hover:text-[#E4E7EC]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {data?.error && (
        <div className="terminal-panel rounded px-4 py-2.5 text-xs text-amber-400">
          DexScreener notice: {data.error}
        </div>
      )}

      <div className="terminal-panel rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="border-b border-[#E4E7EC]/8 text-[11px] text-[#646D7D]">
                <th className="py-2.5 px-4 font-medium">#</th>
                <th className="py-2.5 px-3 font-medium">Token</th>
                <th className="py-2.5 px-3 font-medium">Mint</th>
                <th className="py-2.5 px-3 font-medium text-right">Price</th>
                <th className="py-2.5 px-3 font-medium text-right">Change ({timeframe})</th>
                <th className="py-2.5 px-3 font-medium text-right">Volume ({timeframe})</th>
                <th className="py-2.5 px-3 font-medium text-right">Liquidity</th>
                <th className="py-2.5 px-3 font-medium text-right">FDV / MCap</th>
                <th className="py-2.5 px-4 font-medium text-right">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]/6 text-xs">
              {loading && list.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#646D7D]">
                    Fetching live Solana market rankings...
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#9AA3B2]">
                    No ranked tokens available in this category yet.
                  </td>
                </tr>
              ) : (
                list.map((t, idx) => {
                  const pct =
                    timeframe === '5m'
                      ? t.priceChange5m
                      : timeframe === '1h'
                        ? t.priceChange1h
                        : t.priceChange24h;
                  const vol =
                    timeframe === '5m'
                      ? t.volume5mUsd
                      : timeframe === '1h'
                        ? t.volume1hUsd
                        : t.volume24hUsd;
                  return (
                    <tr
                      key={t.mint}
                      onClick={() => onSelectToken(t.mint)}
                      className="hover:bg-[#13161C] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono-num text-[#646D7D]">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#E4E7EC]">{t.name}</div>
                        <div className="text-[11px] font-mono-num text-[#E5C76B]">
                          {t.symbol} · {t.dexId ?? 'Solana'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <CopyAddress address={t.mint} />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                        {formatPriceUsd(t.priceUsd)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono-num ${
                          pct === null
                            ? 'text-[#646D7D]'
                            : pct >= 0
                              ? 'text-emerald-400'
                              : 'text-red-400'
                        }`}
                      >
                        {formatPct(pct)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                        {formatUsd(vol)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                        {formatUsd(t.liquidityUsd)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num text-[#9AA3B2]">
                        {formatUsd(t.marketCapUsd ?? t.fdvUsd)}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <RiskLabelText category={t.riskCategory} score={t.riskScore} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {data?.fetchedAt && (
          <div className="px-4 py-2 border-t border-[#E4E7EC]/8 text-[11px] font-mono-num text-[#646D7D]">
            Last Updated: {formatTimeAgo(data.fetchedAt)}
          </div>
        )}
      </div>
    </div>
  );
};
