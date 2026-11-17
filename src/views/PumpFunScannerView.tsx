import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { CollectorHealth, TokenRecord } from '../types/domain';
import { api } from '../lib/api';
import { formatSol, formatTimeAgo, formatUsd } from '../lib/format';
import {
  CollectorStatusLabelText,
  CopyAddress,
  ExplorerLinks,
  RiskLabelText,
} from '../components/TokenStatusElements';

interface PumpFunScannerViewProps {
  pumpStatus: CollectorHealth | null;
  streamTick: number;
  onSelectToken: (mint: string) => void;
}

export const PumpFunScannerView: React.FC<PumpFunScannerViewProps> = ({
  pumpStatus,
  streamTick,
  onSelectToken,
}) => {
  const [tab, setTab] = useState<'launches' | 'migrations'>('launches');
  const [launches, setLaunches] = useState<TokenRecord[]>([]);
  const [migrations, setMigrations] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusyMint, setActionBusyMint] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [launchRes, migRes] = await Promise.all([
        api.getTokens({ source: 'pumpportal-create', pageSize: 30 }),
        api.getTokens({ source: 'migrated', pageSize: 30 }),
      ]);
      setLaunches(launchRes.items);
      setMigrations(migRes.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [streamTick]);

  const handleQuickAnalyze = async (e: React.MouseEvent, mint: string) => {
    e.stopPropagation();
    setActionBusyMint(mint);
    try {
      await api.analyzeToken(mint);
      await loadData();
    } finally {
      setActionBusyMint(null);
    }
  };

  const activeList = tab === 'launches' ? launches : migrations;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-[#E4E7EC]">Pump.fun Scanner</h1>
            <CollectorStatusLabelText
              status={pumpStatus?.status ?? 'CONNECTING'}
              label="WS"
            />
          </div>
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Dedicated server-side PumpPortal feed (`subscribeNewToken` & `subscribeMigration`).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-[#13161C] border border-[#E4E7EC]/10 rounded">
            <button
              type="button"
              onClick={() => setTab('launches')}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                tab === 'launches'
                  ? 'bg-[#D4AF37] text-[#060709]'
                  : 'text-[#9AA3B2] hover:text-[#E4E7EC]'
              }`}
            >
              New Launches ({launches.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('migrations')}
              className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                tab === 'migrations'
                  ? 'bg-[#D4AF37] text-[#060709]'
                  : 'text-[#9AA3B2] hover:text-[#E4E7EC]'
              }`}
            >
              Migrations ({migrations.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            className="p-2 bg-[#13161C] border border-[#E4E7EC]/10 rounded text-[#9AA3B2] hover:text-[#E5C76B] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Telemetry Summary Strip */}
      <div className="terminal-panel rounded px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-[#646D7D]">Endpoint</span>
          <div className="font-mono-num text-[#E4E7EC] truncate mt-0.5">
            {pumpStatus?.endpoint ?? 'wss://pumpportal.fun/api/data'}
          </div>
        </div>
        <div>
          <span className="text-[#646D7D]">Events Captured</span>
          <div className="font-mono-num text-[#E5C76B] mt-0.5">
            {(pumpStatus?.eventsReceived ?? 0).toLocaleString()}
          </div>
        </div>
        <div>
          <span className="text-[#646D7D]">Last Event</span>
          <div className="font-mono-num text-[#E4E7EC] mt-0.5">
            {formatTimeAgo(pumpStatus?.lastEventAt)}
          </div>
        </div>
        <div>
          <span className="text-[#646D7D]">Reconnects</span>
          <div className="font-mono-num text-[#E4E7EC] mt-0.5">
            {pumpStatus?.reconnectCount ?? 0}
          </div>
        </div>
      </div>

      {/* Feed Table */}
      <div className="terminal-panel rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="border-b border-[#E4E7EC]/8 text-[11px] text-[#646D7D]">
                <th className="py-2.5 px-4 font-medium">Token</th>
                <th className="py-2.5 px-3 font-medium">Mint</th>
                <th className="py-2.5 px-3 font-medium">Creator</th>
                <th className="py-2.5 px-3 font-medium text-right">Initial Buy</th>
                <th className="py-2.5 px-3 font-medium text-right">Curve SOL</th>
                <th className="py-2.5 px-3 font-medium text-right">MCap / Liq</th>
                <th className="py-2.5 px-3 font-medium text-right">Risk</th>
                <th className="py-2.5 px-3 font-medium text-right">Detected</th>
                <th className="py-2.5 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E7EC]/6 text-xs">
              {loading && activeList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#646D7D]">
                    Loading Pump.fun event stream...
                  </td>
                </tr>
              ) : activeList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#9AA3B2]">
                    No {tab === 'launches' ? 'new Pump.fun launches' : 'migrations'} captured yet. Collector state: {pumpStatus?.status ?? 'CONNECTING'}.
                  </td>
                </tr>
              ) : (
                activeList.map((t) => (
                  <tr
                    key={t.mint}
                    onClick={() => onSelectToken(t.mint)}
                    className="hover:bg-[#13161C] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#E4E7EC]">{t.name}</div>
                      <div className="font-mono-num text-[11px] text-[#E5C76B]">
                        {t.symbol}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <CopyAddress address={t.mint} />
                    </td>
                    <td className="py-2.5 px-3">
                      <CopyAddress address={t.creatorWallet} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                      {formatSol(t.initialBuySol)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#9AA3B2]">
                      {formatSol(t.vSolInBondingCurve)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                      {t.liquidityUsd !== null
                        ? formatUsd(t.liquidityUsd)
                        : formatSol(t.marketCapSol)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <RiskLabelText category={t.riskCategory} score={t.riskScore} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#9AA3B2] whitespace-nowrap">
                      {formatTimeAgo(t.migratedAt ?? t.detectedAt)}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={actionBusyMint === t.mint}
                        onClick={(e) => void handleQuickAnalyze(e, t.mint)}
                        className="px-2 py-1 bg-[#13161C] border border-[#D4AF37]/30 hover:border-[#D4AF37] rounded text-[11px] text-[#E5C76B] cursor-pointer disabled:opacity-50"
                      >
                        {actionBusyMint === t.mint ? 'Scanning...' : 'Scan'}
                      </button>
                      <ExplorerLinks mint={t.mint} compact />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
