import type { CollectorStatusLabel, RiskCategory } from '../types/domain';

export function shortAddress(addr: string | null | undefined, head = 4, tail = 4): string {
  if (!addr) return 'N/A';
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export function formatUsd(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export function formatPriceUsd(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  if (val === 0) return '$0.00';
  if (val < 0.000001) return `$${val.toExponential(3)}`;
  if (val < 0.01) return `$${val.toFixed(6)}`;
  if (val < 1) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(2)}`;
}

export function formatSol(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  return `${val.toFixed(2)} SOL`;
}

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

export function formatCompact(val: number | null | undefined): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(val);
}

export function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'N/A';
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

export function formatUtcTime(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export function getRiskTextColor(cat: RiskCategory): string {
  switch (cat) {
    case 'Low':
      return 'text-emerald-400';
    case 'Medium':
      return 'text-amber-400';
    case 'High':
      return 'text-orange-400';
    case 'Critical':
      return 'text-red-400';
    default:
      return 'text-[#9AA3B2]';
  }
}

export function getCollectorStatusColor(status: CollectorStatusLabel): string {
  switch (status) {
    case 'LIVE':
      return 'text-emerald-400';
    case 'CONNECTING':
      return 'text-amber-400';
    case 'DEMO':
      return 'text-[#E5C76B]';
    case 'ERROR':
      return 'text-red-400';
    case 'OPTIONAL / SKIPPED':
      return 'text-[#646D7D]';
    case 'DISCONNECTED':
    default:
      return 'text-[#9AA3B2]';
  }
}

export function formatSourceLabel(source: string): string {
  switch (source) {
    case 'pumpportal-create':
      return 'Pump.fun Launch';
    case 'pumpportal-migration':
      return 'Pump.fun Migration';
    case 'helius-stream':
      return 'Helius Stream';
    case 'manual-inspect':
      return 'Manual Inspect';
    case 'demo-sample':
      return 'DEMO';
    default:
      return source;
  }
}
