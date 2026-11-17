import React, { useState } from 'react';
import type { HolderEntry, MarketSnapshot } from '../../types/domain';
import { formatPriceUsd, formatUsd, shortAddress } from '../../lib/format';

interface ActivityPoint {
  label: string;
  launches: number;
  migrations: number;
  volumeUsd: number;
}

export const ActivityBarChart: React.FC<{ data: ActivityPoint[] }> = ({ data }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.map((d) => d.launches + d.migrations));

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-[#646D7D]">
        No activity buckets recorded for this range yet.
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="h-48 flex items-end gap-2 pt-6 pb-2 px-1">
        {data.map((point, idx) => {
          const total = point.launches + point.migrations;
          const launchPct = (point.launches / maxVal) * 100;
          const migPct = (point.migrations / maxVal) * 100;
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={`${point.label}-${idx}`}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
            >
              <div className="w-full max-w-[34px] flex flex-col justify-end h-full gap-0.5">
                {point.migrations > 0 && (
                  <div
                    style={{ height: `${Math.max(4, migPct)}%` }}
                    className={`w-full rounded-t-sm transition-opacity ${
                      isHovered ? 'bg-[#E5C76B]' : 'bg-[#D4AF37]'
                    }`}
                  />
                )}
                {point.launches > 0 && (
                  <div
                    style={{ height: `${Math.max(4, launchPct)}%` }}
                    className={`w-full rounded-t-sm transition-colors ${
                      isHovered ? 'bg-[#9AA3B2]' : 'bg-[#646D7D]/70'
                    }`}
                  />
                )}
                {total === 0 && <div className="w-full h-[2px] bg-[#E4E7EC]/10" />}
              </div>
              <span className="mt-2 text-[10px] font-mono-num text-[#646D7D] whitespace-nowrap">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-[#13161C] border border-[#E4E7EC]/10 rounded text-xs">
          <span className="font-mono-num text-[#E4E7EC]">
            Window {data[hoveredIdx].label} UTC
          </span>
          <div className="flex items-center gap-4 font-mono-num">
            <span className="text-[#9AA3B2]">
              Launches: <strong className="text-[#E4E7EC]">{data[hoveredIdx].launches}</strong>
            </span>
            <span className="text-[#D4AF37]">
              Migrations: <strong>{data[hoveredIdx].migrations}</strong>
            </span>
            <span className="text-[#9AA3B2]">
              Vol: <strong className="text-[#E4E7EC]">{formatUsd(data[hoveredIdx].volumeUsd)}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export const SnapshotHistoryChart: React.FC<{
  snapshots: MarketSnapshot[];
  metric: 'priceUsd' | 'liquidityUsd' | 'volume24hUsd';
}> = ({ snapshots, metric }) => {
  const ordered = [...snapshots]
    .reverse()
    .filter((s) => s[metric] !== null && s[metric] !== undefined);

  if (ordered.length < 2) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-[#646D7D] border border-dashed border-[#E4E7EC]/10 rounded">
        At least 2 DexScreener snapshots are needed to plot {metric === 'priceUsd' ? 'price' : metric === 'liquidityUsd' ? 'liquidity' : 'volume'} history. Click Enrich Market Data to record snapshots over time.
      </div>
    );
  }

  const values = ordered.map((s) => Number(s[metric] ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 560;
  const height = 140;
  const pad = 14;

  const coords = ordered.map((s, i) => {
    const x = pad + (i / (ordered.length - 1)) * (width - pad * 2);
    const y = height - pad - ((Number(s[metric] ?? 0) - min) / span) * (height - pad * 2);
    return { x, y, s };
  });

  const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height - pad} L ${coords[0].x} ${height - pad} Z`;

  const fmt = metric === 'priceUsd' ? formatPriceUsd : formatUsd;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-mono-num text-[#9AA3B2] mb-2">
        <span>Min: {fmt(min)}</span>
        <span>Latest: {fmt(values[values.length - 1])}</span>
        <span>Max: {fmt(max)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36 overflow-visible">
        <defs>
          <linearGradient id={`goldGrad-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#goldGrad-${metric})`} />
        <path d={linePath} fill="none" stroke="#D4AF37" strokeWidth="2" />
        {coords.map((c, idx) => (
          <circle
            key={idx}
            cx={c.x}
            cy={c.y}
            r="3"
            fill="#E5C76B"
            stroke="#060709"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  );
};

export const BuySellRatioBar: React.FC<{
  buys: number | null;
  sells: number | null;
  label?: string;
}> = ({ buys, sells, label }) => {
  if (buys === null && sells === null) {
    return <span className="text-xs font-mono-num text-[#646D7D]">N/A</span>;
  }
  const b = buys ?? 0;
  const s = sells ?? 0;
  const total = b + s;
  if (total === 0) {
    return <span className="text-xs font-mono-num text-[#646D7D]">0 / 0</span>;
  }
  const buyPct = Math.round((b / total) * 100);
  const sellPct = 100 - buyPct;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[11px] font-mono-num mb-1">
        <span className="text-emerald-400">
          {label ? `${label} ` : ''}Buys {b.toLocaleString()} ({buyPct}%)
        </span>
        <span className="text-red-400">
          Sells {s.toLocaleString()} ({sellPct}%)
        </span>
      </div>
      <div className="h-1.5 w-full bg-red-500/35 rounded-sm overflow-hidden flex">
        <div style={{ width: `${buyPct}%` }} className="h-full bg-emerald-500/80" />
      </div>
    </div>
  );
};

export const HolderDistributionBars: React.FC<{ holders: HolderEntry[] }> = ({ holders }) => {
  const top = holders.slice(0, 8);
  if (top.length === 0) {
    return (
      <div className="text-xs text-[#646D7D] py-6 text-center">
        No holder distribution data analyzed yet. Run on-chain risk scan to inspect top token accounts.
      </div>
    );
  }
  const maxPct = Math.max(1, ...top.map((h) => h.percentageOfSupply ?? 0));

  return (
    <div className="space-y-2.5">
      {top.map((h) => {
        const pct = h.percentageOfSupply ?? 0;
        const barW = Math.min(100, (pct / maxPct) * 100);
        return (
          <div key={h.tokenAccount} className="space-y-1">
            <div className="flex items-center justify-between text-xs font-mono-num">
              <span className="text-[#9AA3B2]">
                #{h.rank} {shortAddress(h.owner || h.tokenAccount, 6, 4)}
              </span>
              <span className="text-[#E4E7EC]">
                {h.percentageOfSupply !== null ? `${h.percentageOfSupply.toFixed(2)}%` : 'N/A'}
              </span>
            </div>
            <div className="h-1.5 bg-[#13161C] rounded-sm overflow-hidden">
              <div
                style={{ width: `${barW}%` }}
                className={`h-full ${
                  pct > 25 ? 'bg-amber-400' : 'bg-[#D4AF37]'
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
