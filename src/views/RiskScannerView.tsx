import React, { useState } from 'react';
import { ExternalLink, ShieldAlert, Sparkles } from 'lucide-react';
import type { RiskAssessment, TokenRecord, WalletAnalytics } from '../types/domain';
import { api } from '../lib/api';
import { formatUtcTime } from '../lib/format';
import { RiskLabelText, StageText } from '../components/TokenStatusElements';

interface RiskScannerViewProps {
  onSelectToken: (mint: string) => void;
}

export const RiskScannerView: React.FC<RiskScannerViewProps> = ({
  onSelectToken,
}) => {
  const [mintInput, setMintInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    token: TokenRecord;
    walletAnalytics: WalletAnalytics;
    riskAssessment: RiskAssessment;
  } | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = mintInput.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.inspectMint(cleaned);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Risk scan failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAiBrief = async () => {
    if (!result) return;
    setAiLoading(true);
    setError(null);
    try {
      const updatedRisk = await api.generateAiBrief(result.token.mint);
      setResult({ ...result, riskAssessment: updatedRisk });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed generating AI brief');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#E4E7EC]">Risk Scanner</h1>
        <p className="text-xs text-[#9AA3B2] mt-0.5">
          Deterministic Solana SPL & Token-2022 audit: mint/freeze authority, extensions, mutable metadata, liquidity depth, and holder concentration.
        </p>
      </div>

      <form
        onSubmit={handleScan}
        className="terminal-panel rounded p-4 flex flex-col sm:flex-row gap-3"
      >
        <input
          type="text"
          value={mintInput}
          onChange={(e) => setMintInput(e.target.value)}
          placeholder="Paste any Solana Mainnet token mint address..."
          className="flex-1 bg-[#13161C] border border-[#E4E7EC]/12 focus:border-[#D4AF37]/50 rounded px-3 py-2 text-xs font-mono-num text-[#E4E7EC] placeholder-[#646D7D] focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-[#D4AF37] hover:bg-[#E5C76B] text-[#060709] font-semibold text-xs rounded whitespace-nowrap cursor-pointer disabled:opacity-50"
        >
          {loading ? 'Running On-Chain Checks...' : 'Scan Token Risk'}
        </button>
      </form>

      {error && (
        <div className="terminal-panel rounded p-4 text-xs text-red-400">{error}</div>
      )}

      {result && (
        <div className="space-y-5">
          {/* Summary Header */}
          <div className="terminal-panel rounded p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-[#E4E7EC]">
                  {result.token.name} ({result.token.symbol})
                </h2>
                <StageText stage={result.token.verificationStage} />
              </div>
              <div className="text-xs font-mono-num text-[#646D7D]">
                Mint: {result.token.mint} · Analyzed {formatUtcTime(result.riskAssessment.analyzedAt)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="text-right">
                <div className="text-[11px] text-[#646D7D]">Deterministic Risk Score</div>
                <div className="text-lg font-semibold">
                  <RiskLabelText
                    category={result.riskAssessment.category}
                    score={result.riskAssessment.score}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectToken(result.token.mint)}
                className="px-3 py-2 bg-[#13161C] border border-[#E4E7EC]/15 hover:border-[#D4AF37]/40 rounded text-xs text-[#E4E7EC] cursor-pointer"
              >
                Full Dossier
              </button>
            </div>
          </div>

          {/* Authority & Program Checks Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="terminal-panel rounded p-4">
              <div className="text-[#646D7D]">Mint Authority</div>
              <div
                className={`mt-1 font-semibold uppercase font-mono-num ${
                  result.riskAssessment.mintAuthorityStatus === 'revoked'
                    ? 'text-emerald-400'
                    : result.riskAssessment.mintAuthorityStatus === 'active'
                      ? 'text-red-400'
                      : 'text-[#9AA3B2]'
                }`}
              >
                {result.riskAssessment.mintAuthorityStatus}
              </div>
            </div>

            <div className="terminal-panel rounded p-4">
              <div className="text-[#646D7D]">Freeze Authority</div>
              <div
                className={`mt-1 font-semibold uppercase font-mono-num ${
                  result.riskAssessment.freezeAuthorityStatus === 'revoked'
                    ? 'text-emerald-400'
                    : result.riskAssessment.freezeAuthorityStatus === 'active'
                      ? 'text-red-400'
                      : 'text-[#9AA3B2]'
                }`}
              >
                {result.riskAssessment.freezeAuthorityStatus}
              </div>
            </div>

            <div className="terminal-panel rounded p-4">
              <div className="text-[#646D7D]">Metadata Mutability</div>
              <div
                className={`mt-1 font-semibold uppercase font-mono-num ${
                  result.riskAssessment.metadataMutable === 'immutable'
                    ? 'text-emerald-400'
                    : result.riskAssessment.metadataMutable === 'mutable'
                      ? 'text-amber-400'
                      : 'text-[#9AA3B2]'
                }`}
              >
                {result.riskAssessment.metadataMutable}
              </div>
            </div>

            <div className="terminal-panel rounded p-4">
              <div className="text-[#646D7D]">LP Lock / Burn Proof</div>
              <div className="mt-1 font-semibold uppercase font-mono-num text-[#9AA3B2]">
                {result.riskAssessment.lpStatus}
              </div>
            </div>
          </div>

          {/* Findings List */}
          <div className="terminal-panel rounded overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#E4E7EC]">
                Individual Evidence Findings ({result.riskAssessment.findings.length})
              </h3>
              <button
                type="button"
                disabled={aiLoading}
                onClick={() => void handleAiBrief()}
                className="px-3 py-1.5 bg-[#13161C] border border-[#D4AF37]/35 hover:border-[#D4AF37] rounded text-xs text-[#E5C76B] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {aiLoading ? 'Synthesizing...' : 'Generate Optional AI Brief'}
                </span>
              </button>
            </div>

            <div className="divide-y divide-[#E4E7EC]/6">
              {result.riskAssessment.findings.map((f) => (
                <div
                  key={f.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-semibold ${
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
                      </span>
                      {f.scoreImpact > 0 && (
                        <span className="font-mono-num text-[#646D7D]">
                          +{f.scoreImpact} pts
                        </span>
                      )}
                    </div>
                    <p className="text-[#9AA3B2]">{f.detail}</p>
                  </div>
                  {f.evidenceUrl && (
                    <a
                      href={f.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#E5C76B] hover:underline shrink-0"
                    >
                      <span>Evidence</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Optional On-Demand AI Brief */}
          {result.riskAssessment.aiSummary && (
            <div className="terminal-panel rounded p-4 space-y-2 border-[#D4AF37]/30">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#E5C76B]">
                  On-Demand Gemini Research Summary
                </span>
                <span className="font-mono-num text-[#646D7D]">
                  {formatUtcTime(result.riskAssessment.aiGeneratedAt)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-[#E4E7EC]">
                {result.riskAssessment.aiSummary}
              </p>
            </div>
          )}

          {/* Mandatory Risk Disclaimer */}
          <div className="terminal-panel rounded p-4 flex items-start gap-3 text-xs text-[#9AA3B2]">
            <ShieldAlert className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
            <p>{result.riskAssessment.disclaimer}</p>
          </div>
        </div>
      )}
    </div>
  );
};
