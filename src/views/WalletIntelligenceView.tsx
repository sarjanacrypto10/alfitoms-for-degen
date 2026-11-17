import React, { useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import type { TokenRecord, WalletAnalytics, WalletTxSummary } from '../types/domain';
import { api } from '../lib/api';
import { formatSol, formatTimeAgo, formatUtcTime } from '../lib/format';
import { CopyAddress } from '../components/TokenStatusElements';
import { HolderDistributionBars } from '../components/charts/TerminalCharts';

interface WalletIntelligenceViewProps {
  onSelectToken: (mint: string) => void;
}

export const WalletIntelligenceView: React.FC<WalletIntelligenceViewProps> = ({
  onSelectToken,
}) => {
  const [mode, setMode] = useState<'token' | 'wallet'>('token');
  const [queryInput, setQueryInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tokenWalletData, setTokenWalletData] = useState<{
    token: TokenRecord;
    walletAnalytics: WalletAnalytics;
  } | null>(null);

  const [standaloneWalletData, setStandaloneWalletData] = useState<{
    address: string;
    balanceSol: number | null;
    recentTxs: WalletTxSummary[];
    fundingSources: Array<{
      funder: string;
      solAmount: number;
      signature: string;
      blockTime: string | null;
    }>;
    createdTokens: TokenRecord[];
    error: string | null;
  } | null>(null);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = queryInput.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'token') {
        const res = await api.analyzeToken(cleaned);
        setTokenWalletData({ token: res.token, walletAnalytics: res.walletAnalytics });
        setStandaloneWalletData(null);
      } else {
        const res = await api.inspectWallet(cleaned);
        if (!res.valid) {
          setError(res.error || 'Invalid Solana wallet address.');
        } else {
          setStandaloneWalletData(res);
          setTokenWalletData(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'On-chain inspection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#E4E7EC]">Wallet Intelligence</h1>
        <p className="text-xs text-[#9AA3B2] mt-0.5">
          Inspect creator wallets, top token holders, same-slot bundled activity, and SOL funding provenance using Solana Mainnet RPC evidence.
        </p>
      </div>

      {/* Mode Switch & Input */}
      <div className="terminal-panel rounded p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('token')}
            className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
              mode === 'token'
                ? 'bg-[#D4AF37] text-[#060709]'
                : 'bg-[#13161C] text-[#9AA3B2] hover:text-[#E4E7EC]'
            }`}
          >
            Analyze Token Holders & Clusters (Mint)
          </button>
          <button
            type="button"
            onClick={() => setMode('wallet')}
            className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
              mode === 'wallet'
                ? 'bg-[#D4AF37] text-[#060709]'
                : 'bg-[#13161C] text-[#9AA3B2] hover:text-[#E4E7EC]'
            }`}
          >
            Inspect Developer / Trader Wallet
          </button>
        </div>

        <form onSubmit={handleAnalyze} className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center flex-1 bg-[#13161C] border border-[#E4E7EC]/12 focus-within:border-[#D4AF37]/50 rounded px-3 py-2">
            <Search className="w-4 h-4 text-[#646D7D] mr-2 shrink-0" />
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder={
                mode === 'token'
                  ? 'Enter Solana token mint address...'
                  : 'Enter Solana wallet public key...'
              }
              className="w-full bg-transparent text-xs font-mono-num text-[#E4E7EC] placeholder-[#646D7D] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-[#D4AF37] hover:bg-[#E5C76B] text-[#060709] font-semibold text-xs rounded whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Scanning On-Chain...' : 'Run Evidence Scan'}
          </button>
        </form>

        <div className="text-[11px] text-[#646D7D]">
          Standard: Wallets are never labeled as insiders or malicious without direct on-chain transaction or funding evidence.
        </div>
      </div>

      {error && (
        <div className="terminal-panel rounded p-4 text-xs text-red-400">{error}</div>
      )}

      {/* Token Wallet Forensics Result */}
      {tokenWalletData && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="terminal-panel rounded p-4">
              <div className="text-xs text-[#9AA3B2]">Token Program</div>
              <div className="mt-1 text-sm font-semibold text-[#E4E7EC]">
                {tokenWalletData.walletAnalytics.tokenProgram}
              </div>
              <div className="mt-1 text-[11px] font-mono-num text-[#646D7D]">
                {tokenWalletData.walletAnalytics.rpcEndpointLabel}
              </div>
            </div>
            <div className="terminal-panel rounded p-4">
              <div className="text-xs text-[#9AA3B2]">Top 1 / Top 5 / Top 10</div>
              <div className="mt-1 text-sm font-semibold font-mono-num text-[#E5C76B]">
                {tokenWalletData.walletAnalytics.top1Pct ?? 'N/A'}% ·{' '}
                {tokenWalletData.walletAnalytics.top5Pct ?? 'N/A'}% ·{' '}
                {tokenWalletData.walletAnalytics.top10Pct ?? 'N/A'}%
              </div>
              <div className="mt-1 text-[11px] text-[#646D7D]">Of Total Supply</div>
            </div>
            <div className="terminal-panel rounded p-4">
              <div className="text-xs text-[#9AA3B2]">Creator Wallet</div>
              <div className="mt-1">
                <CopyAddress address={tokenWalletData.walletAnalytics.creatorWallet} />
              </div>
              <div className="mt-1 text-[11px] font-mono-num text-[#646D7D]">
                Bal: {formatSol(tokenWalletData.walletAnalytics.creatorBalanceSol)}
              </div>
            </div>
            <div className="terminal-panel rounded p-4">
              <div className="text-xs text-[#9AA3B2]">Token Dossier</div>
              <button
                type="button"
                onClick={() => onSelectToken(tokenWalletData.token.mint)}
                className="mt-1 text-xs font-medium text-[#D4AF37] hover:text-[#E5C76B] cursor-pointer"
              >
                Open {tokenWalletData.token.symbol} Detail →
              </button>
              <div className="mt-1 text-[11px] text-[#646D7D]">
                {formatTimeAgo(tokenWalletData.walletAnalytics.analyzedAt)}
              </div>
            </div>
          </div>

          {/* Cluster & Bundle Evidence */}
          <div className="terminal-panel rounded p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Observed Cluster & Bundle Signals
            </h2>
            {tokenWalletData.walletAnalytics.clusterSignals.length === 0 ? (
              <div className="text-xs text-[#9AA3B2]">
                No same-slot transaction clusters (&ge; 3 txs in identical slot) detected in the latest 25 mint signatures.
              </div>
            ) : (
              <div className="space-y-2">
                {tokenWalletData.walletAnalytics.clusterSignals.map((sig, i) => (
                  <div
                    key={i}
                    className="p-3 bg-[#13161C] border border-[#E4E7EC]/8 rounded text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium ${
                          sig.severity === 'critical'
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {sig.title}
                      </span>
                      {sig.slot && (
                        <span className="font-mono-num text-[#646D7D]">
                          Slot {sig.slot}
                        </span>
                      )}
                    </div>
                    <p className="text-[#9AA3B2]">{sig.evidence}</p>
                    {sig.signatures.length > 0 && (
                      <div className="flex flex-wrap gap-3 pt-1">
                        {sig.signatures.map((s) => (
                          <a
                            key={s}
                            href={`https://solscan.io/tx/${s}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono-num text-[11px] text-[#E5C76B] hover:underline"
                          >
                            <span>{s.slice(0, 10)}...</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tokenWalletData.walletAnalytics.observationNotes.length > 0 && (
              <ul className="space-y-1 text-xs text-[#9AA3B2] pt-2 border-t border-[#E4E7EC]/8">
                {tokenWalletData.walletAnalytics.observationNotes.map((note, idx) => (
                  <li key={idx}>· {note}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="terminal-panel rounded p-4">
              <h2 className="text-sm font-semibold text-[#E4E7EC] mb-3">
                Top Token Account Distribution
              </h2>
              <HolderDistributionBars
                holders={tokenWalletData.walletAnalytics.topHolders}
              />
            </div>

            <div className="terminal-panel rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E4E7EC]/8">
                <h2 className="text-sm font-semibold text-[#E4E7EC]">
                  Creator Funding & Recent Mint Signatures
                </h2>
              </div>
              <div className="divide-y divide-[#E4E7EC]/6 text-xs max-h-80 overflow-y-auto">
                {tokenWalletData.walletAnalytics.creatorFundingSources.map((f, idx) => (
                  <div key={idx} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-[#E5C76B]">SOL Funding Source</div>
                      <CopyAddress address={f.funder} head={6} tail={6} />
                    </div>
                    <a
                      href={`https://solscan.io/tx/${f.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono-num text-[#9AA3B2] hover:text-[#E5C76B] flex items-center gap-1"
                    >
                      <span>
                        +{f.lamports ? (f.lamports / 1e9).toFixed(3) : '?'} SOL
                      </span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
                {tokenWalletData.walletAnalytics.recentMintTxs.slice(0, 12).map((tx) => (
                  <div
                    key={tx.signature}
                    className="px-4 py-2 flex items-center justify-between"
                  >
                    <a
                      href={`https://solscan.io/tx/${tx.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono-num text-[#9AA3B2] hover:text-[#E5C76B] flex items-center gap-1"
                    >
                      <span>{tx.signature.slice(0, 14)}...</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="font-mono-num text-[#646D7D]">
                      Slot {tx.slot} · {tx.blockTime ? formatTimeAgo(tx.blockTime) : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Wallet Lookup Result */}
      {standaloneWalletData && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="terminal-panel rounded p-4">
              <div className="text-xs text-[#9AA3B2]">Wallet Address</div>
              <div className="mt-1">
                <CopyAddress address={standaloneWalletData.address} head={8} tail={8} />
              </div>
            </div>
            <div className="terminal-panel rounded p-4">
              <div className="text-xs text-[#9AA3B2]">SOL Balance</div>
              <div className="mt-1 text-lg font-semibold font-mono-num text-[#E5C76B]">
                {formatSol(standaloneWalletData.balanceSol)}
              </div>
            </div>
            <div className="terminal-panel rounded p-4">
              <div className="text-xs text-[#9AA3B2]">Detected Launches by Wallet</div>
              <div className="mt-1 text-lg font-semibold font-mono-num text-[#E4E7EC]">
                {standaloneWalletData.createdTokens.length}
              </div>
            </div>
          </div>

          {standaloneWalletData.error && (
            <div className="terminal-panel rounded p-3 text-xs text-amber-400">
              {standaloneWalletData.error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="terminal-panel rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E4E7EC]/8">
                <h2 className="text-sm font-semibold text-[#E4E7EC]">
                  Observed SOL Funding Sources
                </h2>
              </div>
              <div className="divide-y divide-[#E4E7EC]/6 text-xs">
                {standaloneWalletData.fundingSources.length === 0 ? (
                  <div className="p-5 text-[#646D7D]">
                    No direct SOL funding transfers found in the latest 20 transactions.
                  </div>
                ) : (
                  standaloneWalletData.fundingSources.map((f, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <CopyAddress address={f.funder} head={6} tail={6} />
                        <div className="text-[11px] font-mono-num text-[#646D7D]">
                          {formatUtcTime(f.blockTime)}
                        </div>
                      </div>
                      <a
                        href={`https://solscan.io/tx/${f.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono-num text-[#E5C76B] flex items-center gap-1"
                      >
                        <span>+{f.solAmount} SOL</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="terminal-panel rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E4E7EC]/8">
                <h2 className="text-sm font-semibold text-[#E4E7EC]">
                  Recent Wallet Transactions
                </h2>
              </div>
              <div className="divide-y divide-[#E4E7EC]/6 text-xs max-h-80 overflow-y-auto">
                {standaloneWalletData.recentTxs.length === 0 ? (
                  <div className="p-5 text-[#646D7D]">No recent transactions found.</div>
                ) : (
                  standaloneWalletData.recentTxs.map((tx) => (
                    <div
                      key={tx.signature}
                      className="px-4 py-2.5 flex items-center justify-between"
                    >
                      <a
                        href={`https://solscan.io/tx/${tx.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono-num text-[#9AA3B2] hover:text-[#E5C76B] flex items-center gap-1"
                      >
                        <span>{tx.signature.slice(0, 16)}...</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className="font-mono-num text-[#646D7D]">
                        Slot {tx.slot} · {tx.err ? 'Failed' : 'Confirmed'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
