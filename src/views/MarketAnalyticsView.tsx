import React, { useEffect, useState } from 'react';
import type { TokenRecord } from '../types/domain';
import { api } from '../lib/api';
import { formatUsd } from '../lib/format';
import { ActivityBarChart, BuySellRatioBar } from '../components/charts/TerminalCharts';

interface MarketAnalyticsViewProps {
  onSelectToken: (mint: string) => void;
}

export const MarketAnalyticsView: React.FC<MarketAnalyticsViewProps> = ({
  onSelectToken,
}) => {
  const [range, setRange] = useState<'1h' | '6h' | '24h'>('24h');
  const [analytics, setAnalytics] = useState<{
    range: string;
    summary: {
      trackedTokens: number;
      enrichedTokens: number;
      totalVolume24h: number;
      totalVolume1h: number;
      totalVolume5m: number;
      totalLiquidity: number;
      buys24h: number;
      sells24h: number;
      buys1h: number;
      sells1h: number;
    };
    activitySeries: Array<{
      label: string;
      launches: number;
      migrations: number;
      volumeUsd: number;
    }>;
    unusualVolume: Array<{ token: TokenRecord; volToLiqRatio: number }>;
    topByLiquidity: TokenRecord[];
  } | null>(null);

  useEffect(() => {
    void api.getAnalytics(range).then(setAnalytics);
  }, [range]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#E4E7EC]">Market Analytics</h1>
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Aggregated Solana launch cadence, buy/sell pressure, and unusual volume-to-liquidity ratios.
          </p>
        </div>

        <div className="flex items-center p-1 bg-[#13161C] border border-[#E4E7EC]/10 rounded text-xs">
          {(['1h', '6h', '24h'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded font-mono-num cursor-pointer ${
                range === r ? 'bg-[#D4AF37] text-[#060709] font-semibold' : 'text-[#9AA3B2]'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">Indexed Volume (24h)</div>
          <div className="mt-1.5 text-lg font-semibold font-mono-num text-[#E4E7EC]">
            {analytics ? formatUsd(analytics.summary.totalVolume24h) : 'N/A'}
          </div>
          <div className="mt-1 text-[11px] font-mono-num text-[#646D7D]">
            1h: {analytics ? formatUsd(analytics.summary.totalVolume1h) : 'N/A'}
          </div>
        </div>

        <div className="terminal-panel rounded p-4">
          <div className="text-xs text-[#9AA3B2]">Total Indexed Liquidity</div>
          <div className="mt-1.5 text-lg font-semibold font-mono-num text-[#E5C76B]">
            {analytics ? formatUsd(analytics.summary.totalLiquidity) : 'N/A'}
          </div>
          <div className="mt-1 text-[11px] font-mono-num text-[#646D7D]">
            Across {analytics?.summary.enrichedTokens ?? 0} enriched tokens
          </div>
        </div>

        <div className="terminal-panel rounded p-4 col-span-2">
          <div className="text-xs text-[#9AA3B2] mb-2">Aggregated Buy / Sell Flow</div>
          <div className="space-y-3">
            <BuySellRatioBar
              label="24h"
              buys={analytics?.summary.buys24h ?? null}
              sells={analytics?.summary.sells24h ?? null}
            />
            <BuySellRatioBar
              label="1h"
              buys={analytics?.summary.buys1h ?? null}
              sells={analytics?.summary.sells1h ?? null}
            />
          </div>
        </div>
      </div>

      {/* Activity Chart */}
      <div className="terminal-panel rounded p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Token Launch & Migration Activity ({range} UTC)
            </h2>
            <p className="text-xs text-[#646D7D]">
              Silver bars show new launches · Gold segments show Pump.fun migrations
            </p>
          </div>
        </div>
        <ActivityBarChart data={analytics?.activitySeries ?? []} />
      </div>

      {/* Unusual Volume vs Liquidity & Top Liquidity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Unusual 1h Volume / Liquidity Ratio
            </h2>
            <p className="text-xs text-[#646D7D]">
              Tokens trading high 1h volume relative to available pool depth
            </p>
          </div>
          <div className="divide-y divide-[#E4E7EC]/6">
            {!analytics || analytics.unusualVolume.length === 0 ? (
              <div className="p-6 text-xs text-[#646D7D]">
                No enriched tokens with 1h volume & liquidity metrics available yet.
              </div>
            ) : (
              analytics.unusualVolume.map(({ token, volToLiqRatio }) => (
                <div
                  key={token.mint}
                  onClick={() => onSelectToken(token.mint)}
                  className="px-4 py-2.5 hover:bg-[#13161C] cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-medium text-[#E4E7EC]">{token.symbol}</span>
                    <span className="text-[#646D7D] ml-2">
                      Liq {formatUsd(token.liquidityUsd)} · 1h Vol {formatUsd(token.volume1hUsd)}
                    </span>
                  </div>
                  <span className="font-mono-num text-[#E5C76B] font-semibold">
                    {volToLiqRatio}%
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Deepest Monitored Liquidity Pools
            </h2>
            <p className="text-xs text-[#646D7D]">
              Sorted by verified DexScreener USD pool liquidity
            </p>
          </div>
          <div className="divide-y divide-[#E4E7EC]/6">
            {!analytics || analytics.topByLiquidity.length === 0 ? (
              <div className="p-6 text-xs text-[#646D7D]">
                No liquidity-indexed tokens available yet.
              </div>
            ) : (
              analytics.topByLiquidity.map((t) => (
                <div
                  key={t.mint}
                  onClick={() => onSelectToken(t.mint)}
                  className="px-4 py-2.5 hover:bg-[#13161C] cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-medium text-[#E4E7EC]">{t.symbol}</span>
                    <span className="text-[#646D7D] ml-2">{t.dexId ?? 'Solana'}</span>
                  </div>
                  <span className="font-mono-num text-[#E4E7EC]">
                    {formatUsd(t.liquidityUsd)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
