import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { WatchlistItem } from '../types/domain';
import { api } from '../lib/api';
import { formatPriceUsd, formatTimeAgo, formatUsd } from '../lib/format';
import { CopyAddress, RiskLabelText } from '../components/TokenStatusElements';

interface WatchlistViewProps {
  onSelectToken: (mint: string) => void;
}

export const WatchlistView: React.FC<WatchlistViewProps> = ({ onSelectToken }) => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mintInput, setMintInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWatchlist = async () => {
    setLoading(true);
    try {
      const res = await api.getWatchlist();
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWatchlist();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const mint = mintInput.trim();
    if (!mint) return;
    setBusy(true);
    setError(null);
    try {
      await api.inspectMint(mint).catch(() => null);
      await api.addToWatchlist({ mint, notes: notesInput.trim() });
      setMintInput('');
      setNotesInput('');
      await loadWatchlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save token');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (e: React.MouseEvent, mint: string) => {
    e.stopPropagation();
    await api.removeFromWatchlist(mint);
    await loadWatchlist();
  };

  const handleRefreshMetrics = async () => {
    setBusy(true);
    try {
      await Promise.all(items.map((w) => api.enrichToken(w.mint).catch(() => null)));
      await loadWatchlist();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#E4E7EC]">Personal Watchlist</h1>
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Persistent workspace-scoped watchlist for monitoring saved Solana tokens and liquidity updates.
          </p>
        </div>

        <button
          type="button"
          disabled={busy || items.length === 0}
          onClick={() => void handleRefreshMetrics()}
          className="px-3 py-1.5 bg-[#13161C] border border-[#E4E7EC]/12 hover:border-[#D4AF37]/40 rounded text-xs text-[#E4E7EC] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${busy ? 'animate-spin' : ''}`} />
          <span>Refresh Saved Metrics</span>
        </button>
      </div>

      <form
        onSubmit={handleAdd}
        className="terminal-panel rounded p-4 grid grid-cols-1 md:grid-cols-12 gap-3"
      >
        <input
          type="text"
          value={mintInput}
          onChange={(e) => setMintInput(e.target.value)}
          placeholder="Solana Mint Address..."
          className="md:col-span-5 bg-[#13161C] border border-[#E4E7EC]/12 focus:border-[#D4AF37]/50 rounded px-3 py-2 text-xs font-mono-num text-[#E4E7EC] placeholder-[#646D7D] focus:outline-none"
        />
        <input
          type="text"
          value={notesInput}
          onChange={(e) => setNotesInput(e.target.value)}
          placeholder="Research notes (optional)..."
          className="md:col-span-5 bg-[#13161C] border border-[#E4E7EC]/12 focus:border-[#D4AF37]/50 rounded px-3 py-2 text-xs text-[#E4E7EC] placeholder-[#646D7D] focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="md:col-span-2 px-4 py-2 bg-[#D4AF37] hover:bg-[#E5C76B] text-[#060709] font-semibold text-xs rounded flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Save Token</span>
        </button>
      </form>

      {error && (
        <div className="terminal-panel rounded p-3 text-xs text-red-400">{error}</div>
      )}

      <div className="terminal-panel rounded overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#646D7D]">Loading watchlist...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#9AA3B2]">
            Your watchlist is empty. Paste a Solana mint address above or click Save on any token dossier.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-[#E4E7EC]/8 text-[11px] text-[#646D7D]">
                  <th className="py-2.5 px-4 font-medium">Token</th>
                  <th className="py-2.5 px-3 font-medium">Mint</th>
                  <th className="py-2.5 px-3 font-medium text-right">Price</th>
                  <th className="py-2.5 px-3 font-medium text-right">Liquidity</th>
                  <th className="py-2.5 px-3 font-medium text-right">Volume 24h</th>
                  <th className="py-2.5 px-3 font-medium text-right">Risk</th>
                  <th className="py-2.5 px-3 font-medium">Notes</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC]/6 text-xs">
                {items.map((w) => (
                  <tr
                    key={w.id}
                    onClick={() => onSelectToken(w.mint)}
                    className="hover:bg-[#13161C] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-[#E4E7EC]">
                        {w.token?.name ?? w.name}
                      </div>
                      <div className="font-mono-num text-[11px] text-[#E5C76B]">
                        {w.token?.symbol ?? w.symbol} · Added {formatTimeAgo(w.addedAt)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <CopyAddress address={w.mint} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                      {formatPriceUsd(w.token?.priceUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                      {formatUsd(w.token?.liquidityUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-[#E4E7EC]">
                      {formatUsd(w.token?.volume24hUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <RiskLabelText
                        category={w.token?.riskCategory ?? 'Unknown'}
                        score={w.token?.riskScore}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-[#9AA3B2] max-w-[200px] truncate">
                      {w.notes || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => void handleRemove(e, w.mint)}
                        aria-label={`Remove ${w.symbol}`}
                        className="p-1.5 text-[#9AA3B2] hover:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
