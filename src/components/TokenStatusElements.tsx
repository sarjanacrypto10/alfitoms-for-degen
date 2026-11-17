import React, { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type {
  CollectorStatusLabel,
  RiskCategory,
  VerificationStage,
} from '../types/domain';
import {
  getCollectorStatusColor,
  getRiskTextColor,
  shortAddress,
} from '../lib/format';

export const CopyAddress: React.FC<{
  address: string | null | undefined;
  head?: number;
  tail?: number;
}> = ({ address, head = 4, tail = 4 }) => {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return <span className="font-mono-num text-xs text-[#646D7D]">N/A</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy ${address}`}
      className="inline-flex items-center gap-1.5 font-mono-num text-xs text-[#9AA3B2] hover:text-[#E5C76B] transition-colors cursor-pointer"
    >
      <span>{shortAddress(address, head, tail)}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
      ) : (
        <Copy className="w-3 h-3 opacity-60 shrink-0" />
      )}
    </button>
  );
};

export const CollectorStatusLabelText: React.FC<{
  status: CollectorStatusLabel;
  label?: string;
}> = ({ status, label }) => {
  const color = getCollectorStatusColor(status);
  const dotColor =
    status === 'LIVE'
      ? 'bg-emerald-400'
      : status === 'CONNECTING'
        ? 'bg-amber-400'
        : status === 'DEMO'
          ? 'bg-[#E5C76B]'
          : status === 'ERROR'
            ? 'bg-red-400'
            : 'bg-[#646D7D]';

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono-num text-xs font-medium ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
      <span>{label ? `${label}: ${status}` : status}</span>
    </span>
  );
};

export const RiskLabelText: React.FC<{
  category: RiskCategory;
  score?: number | null;
}> = ({ category, score }) => {
  const color = getRiskTextColor(category);
  return (
    <span className={`font-mono-num text-xs font-medium ${color} whitespace-nowrap`}>
      {category}
      {score !== null && score !== undefined ? ` (${score})` : ''}
    </span>
  );
};

export const StageText: React.FC<{ stage: VerificationStage }> = ({ stage }) => {
  const color =
    stage === 'Verified'
      ? 'text-emerald-400'
      : stage === 'Analyzed'
        ? 'text-[#E5C76B]'
        : stage === 'Enriched'
          ? 'text-[#E4E7EC]'
          : stage === 'Unverified'
            ? 'text-amber-400'
            : 'text-[#9AA3B2]';

  return <span className={`text-xs font-medium ${color}`}>{stage}</span>;
};

export const ExplorerLinks: React.FC<{
  mint: string;
  compact?: boolean;
}> = ({ mint, compact = false }) => {
  const links = [
    { label: 'Solscan', href: `https://solscan.io/token/${mint}` },
    { label: 'DexScreener', href: `https://dexscreener.com/solana/${mint}` },
    { label: 'Pump.fun', href: `https://pump.fun/coin/${mint}` },
  ];

  return (
    <div className="inline-flex items-center gap-2.5 text-xs">
      {links.slice(0, compact ? 2 : 3).map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[#9AA3B2] hover:text-[#E5C76B] transition-colors whitespace-nowrap"
        >
          <span>{l.label}</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </a>
      ))}
    </div>
  );
};
