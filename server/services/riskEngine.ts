import type {
  RiskAssessment,
  RiskCategory,
  RiskFinding,
  TokenRecord,
  WalletAnalytics,
} from '../../src/types/domain.ts';
import type { OnChainMintInspection } from './solanaOnChainService.ts';

const RISK_DISCLAIMER =
  'Deterministic evidence-based assessment only. Never guarantees safety or profitability. A missing warning does not mean a token is safe. Liquidity lock or burn is never claimed without direct on-chain LP burn/lock proof.';

export function computeDeterministicRisk(params: {
  mint: string;
  token: TokenRecord | null;
  inspection: OnChainMintInspection;
  walletAnalytics: WalletAnalytics;
}): RiskAssessment {
  const { mint, token, inspection, walletAnalytics } = params;
  const findings: RiskFinding[] = [];
  const analyzedAt = new Date().toISOString();
  const solscanTokenUrl = `https://solscan.io/token/${mint}`;

  if (!inspection.exists) {
    findings.push({
      id: 'rpc_unavailable',
      category: 'mint_authority',
      label: 'On-Chain Mint Account Unresolved',
      status: 'unknown',
      scoreImpact: 0,
      detail: inspection.errorMessage || 'Unable to verify mint authorities via Solana RPC.',
      evidenceUrl: solscanTokenUrl,
    });

    return {
      mint,
      analyzedAt,
      score: null,
      category: 'Unknown',
      mintAuthorityStatus: 'unknown',
      mintAuthorityAddress: null,
      freezeAuthorityStatus: 'unknown',
      freezeAuthorityAddress: null,
      metadataMutable: 'unknown',
      token2022Extensions: [],
      lpStatus: 'unverified',
      lpEvidenceNote: 'Unverified — mint account could not be read from Solana RPC.',
      findings,
      disclaimer: RISK_DISCLAIMER,
      aiSummary: null,
      aiGeneratedAt: null,
    };
  }

  let score = 0;

  // 1. Mint Authority
  const mintAuthorityStatus = inspection.mintAuthority ? 'active' : 'revoked';
  if (inspection.mintAuthority) {
    score += 25;
    findings.push({
      id: 'mint_auth_active',
      category: 'mint_authority',
      label: 'Mint Authority Active',
      status: 'critical',
      scoreImpact: 25,
      detail: `Authority ${inspection.mintAuthority} can mint additional token supply.`,
      evidenceUrl: `https://solscan.io/account/${inspection.mintAuthority}`,
    });
  } else {
    findings.push({
      id: 'mint_auth_revoked',
      category: 'mint_authority',
      label: 'Mint Authority Revoked',
      status: 'pass',
      scoreImpact: 0,
      detail: 'On-chain mintAuthority is null; additional supply cannot be minted via standard SPL authority.',
      evidenceUrl: solscanTokenUrl,
    });
  }

  // 2. Freeze Authority
  const freezeAuthorityStatus = inspection.freezeAuthority ? 'active' : 'revoked';
  if (inspection.freezeAuthority) {
    score += 25;
    findings.push({
      id: 'freeze_auth_active',
      category: 'freeze_authority',
      label: 'Freeze Authority Active',
      status: 'critical',
      scoreImpact: 25,
      detail: `Authority ${inspection.freezeAuthority} can freeze holder token accounts.`,
      evidenceUrl: `https://solscan.io/account/${inspection.freezeAuthority}`,
    });
  } else {
    findings.push({
      id: 'freeze_auth_revoked',
      category: 'freeze_authority',
      label: 'Freeze Authority Revoked',
      status: 'pass',
      scoreImpact: 0,
      detail: 'On-chain freezeAuthority is null.',
      evidenceUrl: solscanTokenUrl,
    });
  }

  // 3. Token-2022 Extensions
  if (inspection.tokenProgram === 'Token-2022') {
    const highRiskExts = inspection.token2022Extensions.filter((e) =>
      ['permanentDelegate', 'transferHook', 'nonTransferable', 'mintCloseAuthority'].includes(e)
    );
    const feeExts = inspection.token2022Extensions.filter((e) => e === 'transferFeeConfig');

    if (highRiskExts.length > 0) {
      score += 25;
      findings.push({
        id: 'token2022_high_risk_ext',
        category: 'token_2022_extension',
        label: 'Token-2022 Privileged Extensions Detected',
        status: 'critical',
        scoreImpact: 25,
        detail: `Active Token-2022 extensions: ${highRiskExts.join(', ')}. Review delegate or hook permissions before interacting.`,
        evidenceUrl: solscanTokenUrl,
      });
    } else if (feeExts.length > 0) {
      score += 12;
      findings.push({
        id: 'token2022_fee_ext',
        category: 'token_2022_extension',
        label: 'Token-2022 Transfer Fee Extension',
        status: 'warning',
        scoreImpact: 12,
        detail: 'Token-2022 transferFeeConfig extension is active.',
        evidenceUrl: solscanTokenUrl,
      });
    } else {
      findings.push({
        id: 'token2022_std',
        category: 'token_2022_extension',
        label: 'Token-2022 Standard Program',
        status: 'pass',
        scoreImpact: 0,
        detail:
          inspection.token2022Extensions.length > 0
            ? `Detected extensions: ${inspection.token2022Extensions.join(', ')}`
            : 'No privileged Token-2022 extensions found.',
        evidenceUrl: solscanTokenUrl,
      });
    }
  }

  // 4. Mutable Metadata
  if (inspection.metadataMutable === 'mutable') {
    score += 8;
    findings.push({
      id: 'metadata_mutable',
      category: 'mutable_metadata',
      label: 'Mutable Metaplex Metadata',
      status: 'warning',
      scoreImpact: 8,
      detail: 'Token metadata URI, name, or symbol can still be modified by its update authority.',
      evidenceUrl: solscanTokenUrl,
    });
  } else if (inspection.metadataMutable === 'immutable') {
    findings.push({
      id: 'metadata_immutable',
      category: 'mutable_metadata',
      label: 'Immutable Metaplex Metadata',
      status: 'pass',
      scoreImpact: 0,
      detail: 'Metaplex isMutable flag is set to false.',
      evidenceUrl: solscanTokenUrl,
    });
  } else {
    findings.push({
      id: 'metadata_unknown',
      category: 'mutable_metadata',
      label: 'Metadata Mutability Unknown',
      status: 'unknown',
      scoreImpact: 0,
      detail: 'Standard Metaplex metadata account not found or unreadable.',
      evidenceUrl: solscanTokenUrl,
    });
  }

  // 5. Liquidity Depth
  const liq = token?.liquidityUsd ?? null;
  if (liq === null) {
    findings.push({
      id: 'liquidity_unavailable',
      category: 'liquidity_depth',
      label: 'Market Liquidity Unavailable',
      status: 'unknown',
      scoreImpact: 0,
      detail:
        'No external DEX liquidity pool indexed on DexScreener yet (may still be on bonding curve).',
      evidenceUrl: `https://dexscreener.com/solana/${mint}`,
    });
  } else if (liq < 2500) {
    score += 20;
    findings.push({
      id: 'liquidity_critical',
      category: 'liquidity_depth',
      label: 'Shallow Liquidity Depth',
      status: 'critical',
      scoreImpact: 20,
      detail: `Reported pool liquidity is $${Math.round(liq).toLocaleString('en-US')}, exposing trades to severe slippage.`,
      evidenceUrl: `https://dexscreener.com/solana/${mint}`,
    });
  } else if (liq < 10000) {
    score += 10;
    findings.push({
      id: 'liquidity_low',
      category: 'liquidity_depth',
      label: 'Moderate / Thin Liquidity',
      status: 'warning',
      scoreImpact: 10,
      detail: `Reported pool liquidity is $${Math.round(liq).toLocaleString('en-US')}.`,
      evidenceUrl: `https://dexscreener.com/solana/${mint}`,
    });
  } else {
    findings.push({
      id: 'liquidity_adequate',
      category: 'liquidity_depth',
      label: 'Indexed Pool Liquidity',
      status: 'pass',
      scoreImpact: 0,
      detail: `Reported pool liquidity is $${Math.round(liq).toLocaleString('en-US')}.`,
      evidenceUrl: `https://dexscreener.com/solana/${mint}`,
    });
  }

  // 6. LP Lock / Burn Policy — NEVER claim locked/burned without direct LP proof
  findings.push({
    id: 'lp_unverified',
    category: 'lp_lock_burn',
    label: 'LP Lock / Burn Status Unverified',
    status: 'unknown',
    scoreImpact: 0,
    detail:
      'ALFITOMS FOR DEGEN does not mark LP as locked or burned without direct on-chain LP token burn/locker program verification.',
    evidenceUrl: solscanTokenUrl,
  });

  // 7. Holder Concentration
  const top10 = walletAnalytics.top10Pct;
  if (top10 !== null) {
    if (top10 >= 75) {
      score += 20;
      findings.push({
        id: 'holders_extreme',
        category: 'holder_concentration',
        label: 'High Top-10 Account Concentration',
        status: 'critical',
        scoreImpact: 20,
        detail: `Top 10 token accounts hold ${top10}% of supply. Verify whether #1 is a bonding curve or AMM pool vault.`,
        evidenceUrl: `${solscanTokenUrl}#holders`,
      });
    } else if (top10 >= 45) {
      score += 10;
      findings.push({
        id: 'holders_elevated',
        category: 'holder_concentration',
        label: 'Elevated Top-10 Account Concentration',
        status: 'warning',
        scoreImpact: 10,
        detail: `Top 10 token accounts hold ${top10}% of supply.`,
        evidenceUrl: `${solscanTokenUrl}#holders`,
      });
    } else {
      findings.push({
        id: 'holders_distributed',
        category: 'holder_concentration',
        label: 'Holder Distribution Observed',
        status: 'pass',
        scoreImpact: 0,
        detail: `Top 10 token accounts hold ${top10}% of supply.`,
        evidenceUrl: `${solscanTokenUrl}#holders`,
      });
    }
  }

  // 8. Same-slot / Bundled Activity
  const bundleSignals = walletAnalytics.clusterSignals.filter(
    (s) => s.type === 'same_slot_bundle'
  );
  if (bundleSignals.length > 0) {
    score += 12;
    findings.push({
      id: 'same_slot_clusters',
      category: 'bundled_activity',
      label: 'Same-Slot Transaction Clustering Observed',
      status: 'warning',
      scoreImpact: 12,
      detail: `${bundleSignals.length} slot cluster(s) with >= 3 mint transactions in the same slot. Review signatures before concluding coordinated sniping.`,
      evidenceUrl: bundleSignals[0].signatures[0]
        ? `https://solscan.io/tx/${bundleSignals[0].signatures[0]}`
        : solscanTokenUrl,
    });
  }

  const finalScore = Math.min(100, Math.max(0, score));
  let category: RiskCategory = 'Low';
  if (finalScore >= 75) category = 'Critical';
  else if (finalScore >= 50) category = 'High';
  else if (finalScore >= 25) category = 'Medium';

  return {
    mint,
    analyzedAt,
    score: finalScore,
    category,
    mintAuthorityStatus,
    mintAuthorityAddress: inspection.mintAuthority,
    freezeAuthorityStatus,
    freezeAuthorityAddress: inspection.freezeAuthority,
    metadataMutable: inspection.metadataMutable,
    token2022Extensions: inspection.token2022Extensions,
    lpStatus: 'unverified',
    lpEvidenceNote:
      'No automated LP lock/burn verification claimed; inspect pool LP mint directly on Solscan.',
    findings,
    disclaimer: RISK_DISCLAIMER,
    aiSummary: null,
    aiGeneratedAt: null,
  };
}
