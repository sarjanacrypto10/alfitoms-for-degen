import { GoogleGenAI } from '@google/genai';
import type { RiskAssessment, TokenRecord, WalletAnalytics } from '../../src/types/domain.ts';

export async function generateOnDemandTokenBrief(params: {
  token: TokenRecord;
  risk: RiskAssessment | null;
  wallet: WalletAnalytics | null;
}): Promise<{ summary: string; generatedAt: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Configure it in the Secrets panel to generate on-demand research briefs.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const factsPayload = {
    mint: params.token.mint,
    name: params.token.name,
    symbol: params.token.symbol,
    source: params.token.source,
    detectedAt: params.token.detectedAt,
    migrated: params.token.migrated,
    priceUsd: params.token.priceUsd,
    liquidityUsd: params.token.liquidityUsd,
    volume24hUsd: params.token.volume24hUsd,
    marketCapUsd: params.token.marketCapUsd,
    verificationStage: params.token.verificationStage,
    riskScore: params.risk?.score ?? null,
    riskCategory: params.risk?.category ?? 'Unknown',
    mintAuthorityStatus: params.risk?.mintAuthorityStatus ?? 'unknown',
    freezeAuthorityStatus: params.risk?.freezeAuthorityStatus ?? 'unknown',
    metadataMutable: params.risk?.metadataMutable ?? 'unknown',
    lpStatus: params.risk?.lpStatus ?? 'unverified',
    findings: params.risk?.findings.map((f) => `${f.label}: ${f.detail}`) ?? [],
    top10HolderPct: params.wallet?.top10Pct ?? null,
    clusterSignals: params.wallet?.clusterSignals.map((c) => `${c.title}: ${c.evidence}`) ?? [],
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Summarize the following verified Solana on-chain and market facts into a concise, objective institutional research brief (maximum 140 words). Do NOT invent missing metrics, do NOT predict price, and do NOT guarantee safety or claim LP is burned/locked unless explicitly stated in the facts.\n\nFacts JSON:\n${JSON.stringify(factsPayload, null, 2)}`,
    config: {
      systemInstruction:
        'You are a Solana on-chain risk analyst for ALFITOMS FOR DEGEN. Write sober, factual, evidence-cited prose with zero hype, zero financial advice, and explicit acknowledgment of missing or unverified fields.',
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return {
    summary: text,
    generatedAt: new Date().toISOString(),
  };
}
