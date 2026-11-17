import type {
  RiskAssessment,
  TokenEvent,
  TokenRecord,
  WalletAnalytics,
} from '../../src/types/domain.ts';
import { store } from '../storage/store.ts';
import { evaluateTokenAlertRules } from './alertService.ts';
import { enrichTokenWithDexScreener } from './dexScreenerService.ts';
import { eventBus } from './eventBus.ts';
import { computeDeterministicRisk } from './riskEngine.ts';
import {
  analyzeWalletsOnChain,
  inspectMintOnChain,
  isValidSolanaAddress,
} from './solanaOnChainService.ts';

export async function inspectAndAnalyzeMint(
  rawMint: string,
  options?: { forceRefresh?: boolean; skipMarket?: boolean }
): Promise<{
  token: TokenRecord;
  walletAnalytics: WalletAnalytics;
  riskAssessment: RiskAssessment;
}> {
  const mint = rawMint.trim();
  if (!isValidSolanaAddress(mint)) {
    throw new Error('Invalid Solana Mainnet mint address.');
  }

  const now = new Date().toISOString();
  let existing = store.getToken(mint);

  if (!existing) {
    const manualEvent: TokenEvent = {
      id: `evt_inspect_${Date.now()}`,
      mint,
      signature: `inspect_${Date.now()}`,
      eventType: 'manual_inspect',
      source: 'manual-inspect',
      detectedAt: now,
      creatorWallet: null,
      rawPayload: { mint, action: 'manual_inspect' },
      isDemo: false,
    };
    store.addTokenEvent(manualEvent);

    existing = store.upsertToken({
      mint,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      creatorWallet: null,
      source: 'manual-inspect',
      programId: null,
      signature: null,
      detectedAt: now,
      migrated: false,
      migratedAt: null,
      migrationPool: null,
      initialBuySol: null,
      marketCapSol: null,
      vSolInBondingCurve: null,
      vTokensInBondingCurve: null,
      metadataUri: null,
      imageUrl: null,
      priceUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      volume1hUsd: null,
      volume5mUsd: null,
      priceChange5m: null,
      priceChange1h: null,
      priceChange24h: null,
      buys24h: null,
      sells24h: null,
      buys1h: null,
      sells1h: null,
      pairAddress: null,
      dexId: null,
      riskScore: null,
      riskCategory: 'Unknown',
      verificationStage: 'Detected',
      isDemo: false,
      lastEnrichedAt: null,
      lastAnalyzedAt: null,
      updatedAt: now,
    });
  }

  if (!options?.skipMarket) {
    await enrichTokenWithDexScreener(mint, Boolean(options?.forceRefresh));
  }

  const currentToken = store.getToken(mint) ?? existing;
  const inspection = await inspectMintOnChain(mint, Boolean(options?.forceRefresh));
  const walletAnalytics = await analyzeWalletsOnChain(
    mint,
    currentToken.creatorWallet,
    inspection
  );
  store.setWalletAnalytics(mint, walletAnalytics);

  const riskAssessment = computeDeterministicRisk({
    mint,
    token: currentToken,
    inspection,
    walletAnalytics,
  });
  store.setRiskAssessment(mint, riskAssessment);

  const stage =
    inspection.exists && riskAssessment.score !== null
      ? currentToken.liquidityUsd !== null
        ? 'Verified'
        : 'Analyzed'
      : 'Unverified';

  const updatedToken = store.upsertToken({
    ...currentToken,
    name:
      currentToken.name === 'Unknown Token' && inspection.metadataName
        ? inspection.metadataName
        : currentToken.name,
    symbol:
      currentToken.symbol === 'UNKNOWN' && inspection.metadataSymbol
        ? inspection.metadataSymbol
        : currentToken.symbol,
    metadataUri: currentToken.metadataUri ?? inspection.metadataUri,
    programId: inspection.tokenProgramId ?? currentToken.programId,
    riskScore: riskAssessment.score,
    riskCategory: riskAssessment.category,
    verificationStage: stage,
    lastAnalyzedAt: riskAssessment.analyzedAt,
  });

  eventBus.emitStream({ type: 'token:updated', token: updatedToken });
  await evaluateTokenAlertRules(updatedToken, { risk: riskAssessment });

  return {
    token: updatedToken,
    walletAnalytics,
    riskAssessment,
  };
}
