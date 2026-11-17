import { PublicKey } from '@solana/web3.js';
import type {
  HolderEntry,
  WalletAnalytics,
  WalletClusterSignal,
  WalletTxSummary,
} from '../../src/types/domain.ts';
import { store } from '../storage/store.ts';

const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const METAPLEX_METADATA_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

export interface OnChainMintInspection {
  mint: string;
  exists: boolean;
  tokenProgram: 'SPL Token' | 'Token-2022' | 'Unknown';
  tokenProgramId: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  decimals: number | null;
  supplyUi: number | null;
  token2022Extensions: string[];
  metadataMutable: 'mutable' | 'immutable' | 'unknown';
  metadataName: string | null;
  metadataSymbol: string | null;
  metadataUri: string | null;
  rpcEndpointLabel: string;
  errorMessage: string | null;
}

const rpcCache = new Map<string, { data: unknown; expiresAt: number }>();

function getRpcUrl(): { url: string; label: string } {
  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey) {
    return {
      url: `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`,
      label: 'Helius Mainnet RPC',
    };
  }
  const custom = process.env.SOLANA_RPC_URL?.trim();
  return {
    url: custom || 'https://api.mainnet-beta.solana.com',
    label: custom ? 'Configured Solana RPC' : 'Solana Mainnet Public RPC',
  };
}

export function isValidSolanaAddress(value: string): boolean {
  try {
    const pk = new PublicKey(value.trim());
    return Boolean(pk.toBase58());
  } catch {
    return false;
  }
}

async function rpcCall<T>(method: string, params: unknown[], retries = 2): Promise<T> {
  const { url } = getRpcUrl();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `alf_${Date.now()}`,
          method,
          params,
        }),
        signal: AbortSignal.timeout(9000),
      });

      if (res.status === 429) {
        store.collectorStatus.solanaRpc.status = 'ERROR';
        store.collectorStatus.solanaRpc.lastError = 'Solana RPC rate-limited (HTTP 429)';
        throw new Error('Solana RPC HTTP 429 rate limit');
      }

      if (!res.ok) {
        throw new Error(`Solana RPC HTTP ${res.status}`);
      }

      const payload = (await res.json()) as { result?: T; error?: { message?: string } };
      if (payload.error) {
        throw new Error(payload.error.message || `RPC ${method} error`);
      }

      store.collectorStatus.solanaRpc.status = 'LIVE';
      store.collectorStatus.solanaRpc.lastSuccessAt = new Date().toISOString();
      store.collectorStatus.solanaRpc.lastError = null;
      store.collectorStatus.solanaRpc.eventsReceived += 1;

      return payload.result as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 550 * (attempt + 1)));
      }
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : 'Solana RPC call failed';
  store.collectorStatus.solanaRpc.status = 'ERROR';
  store.collectorStatus.solanaRpc.lastError = msg;
  store.addLog('solana_rpc', 'warn', `RPC ${method} failed: ${msg}`);
  throw lastErr;
}

function parseMetaplexMetadataBytes(base64Data: string): {
  isMutable: boolean | null;
  name: string | null;
  symbol: string | null;
  uri: string | null;
} {
  try {
    const buf = Buffer.from(base64Data, 'base64');
    // Metaplex Token Metadata v1 layout:
    // 1 byte key + 32 bytes updateAuthority + 32 bytes mint = offset 65
    if (buf.length < 70) {
      return { isMutable: null, name: null, symbol: null, uri: null };
    }
    let offset = 65;

    const readBorshString = (): string | null => {
      if (offset + 4 > buf.length) return null;
      const len = buf.readUInt32LE(offset);
      offset += 4;
      if (len > 512 || offset + len > buf.length) return null;
      const raw = buf.subarray(offset, offset + len).toString('utf8');
      offset += len;
      return raw.replace(/\0/g, '').trim();
    };

    const name = readBorshString();
    const symbol = readBorshString();
    const uri = readBorshString();
    // Skip sellerFeeBasisPoints (2 bytes) + Option<Vec<Creator>>
    if (offset + 3 > buf.length) {
      return { isMutable: null, name, symbol, uri };
    }
    offset += 2; // seller_fee_basis_points
    const hasCreators = buf.readUInt8(offset);
    offset += 1;
    if (hasCreators === 1) {
      if (offset + 4 > buf.length) {
        return { isMutable: null, name, symbol, uri };
      }
      const count = buf.readUInt32LE(offset);
      offset += 4;
      // Each Creator = 32 (address) + 1 (verified) + 1 (share) = 34 bytes
      offset += count * 34;
    }
    // primary_sale_happened (1 byte), is_mutable (1 byte)
    if (offset + 2 <= buf.length) {
      offset += 1; // primary_sale_happened
      const isMutableByte = buf.readUInt8(offset);
      return {
        isMutable: isMutableByte === 1,
        name,
        symbol,
        uri,
      };
    }
    return { isMutable: null, name, symbol, uri };
  } catch {
    return { isMutable: null, name: null, symbol: null, uri: null };
  }
}

export async function inspectMintOnChain(
  mint: string,
  forceRefresh = false
): Promise<OnChainMintInspection> {
  const { label } = getRpcUrl();
  const cacheKey = `mint:${mint}`;
  const cached = rpcCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data as OnChainMintInspection;
  }

  if (!isValidSolanaAddress(mint)) {
    return {
      mint,
      exists: false,
      tokenProgram: 'Unknown',
      tokenProgramId: null,
      mintAuthority: null,
      freezeAuthority: null,
      decimals: null,
      supplyUi: null,
      token2022Extensions: [],
      metadataMutable: 'unknown',
      metadataName: null,
      metadataSymbol: null,
      metadataUri: null,
      rpcEndpointLabel: label,
      errorMessage: 'Invalid Solana base58 mint address.',
    };
  }

  try {
    const accountInfoRes = await rpcCall<{
      value: {
        owner: string;
        data?: {
          program?: string;
          parsed?: {
            type?: string;
            info?: {
              decimals?: number;
              supply?: string;
              mintAuthority?: string | null;
              freezeAuthority?: string | null;
              extensions?: Array<{ extension?: string }>;
            };
          };
        };
      } | null;
    }>('getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);

    const val = accountInfoRes?.value;
    if (!val) {
      return {
        mint,
        exists: false,
        tokenProgram: 'Unknown',
        tokenProgramId: null,
        mintAuthority: null,
        freezeAuthority: null,
        decimals: null,
        supplyUi: null,
        token2022Extensions: [],
        metadataMutable: 'unknown',
        metadataName: null,
        metadataSymbol: null,
        metadataUri: null,
        rpcEndpointLabel: label,
        errorMessage: 'Mint account not found on Solana Mainnet.',
      };
    }

    const owner = val.owner;
    const tokenProgram =
      owner === SPL_TOKEN_PROGRAM
        ? 'SPL Token'
        : owner === TOKEN_2022_PROGRAM
          ? 'Token-2022'
          : 'Unknown';

    const info = val.data?.parsed?.info;
    const decimals = typeof info?.decimals === 'number' ? info.decimals : null;
    const supplyRaw = info?.supply ? Number(info.supply) : null;
    const supplyUi =
      supplyRaw !== null && decimals !== null
        ? supplyRaw / Math.pow(10, decimals)
        : null;

    const extensions = Array.isArray(info?.extensions)
      ? info.extensions
          .map((e) => e.extension)
          .filter((e): e is string => typeof e === 'string')
      : [];

    // Check Metaplex Metadata PDA for mutability & on-chain name/symbol
    let metadataMutable: 'mutable' | 'immutable' | 'unknown' = 'unknown';
    let metadataName: string | null = null;
    let metadataSymbol: string | null = null;
    let metadataUri: string | null = null;

    try {
      const metaProgramPk = new PublicKey(METAPLEX_METADATA_PROGRAM);
      const mintPk = new PublicKey(mint);
      const [pda] = await PublicKey.findProgramAddress(
        [Buffer.from('metadata'), metaProgramPk.toBytes(), mintPk.toBytes()],
        metaProgramPk
      );
      const metaAcc = await rpcCall<{
        value: { data?: [string, string] } | null;
      }>('getAccountInfo', [pda.toBase58(), { encoding: 'base64', commitment: 'confirmed' }]);
      const b64 = metaAcc?.value?.data?.[0];
      if (b64) {
        const parsed = parseMetaplexMetadataBytes(b64);
        if (parsed.isMutable === true) metadataMutable = 'mutable';
        else if (parsed.isMutable === false) metadataMutable = 'immutable';
        metadataName = parsed.name || null;
        metadataSymbol = parsed.symbol || null;
        metadataUri = parsed.uri || null;
      }
    } catch {
      // Metadata PDA might not exist on some Token-2022 assets
    }

    const result: OnChainMintInspection = {
      mint,
      exists: true,
      tokenProgram,
      tokenProgramId: owner,
      mintAuthority: info?.mintAuthority ?? null,
      freezeAuthority: info?.freezeAuthority ?? null,
      decimals,
      supplyUi,
      token2022Extensions: extensions,
      metadataMutable,
      metadataName,
      metadataSymbol,
      metadataUri,
      rpcEndpointLabel: label,
      errorMessage: null,
    };

    rpcCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
    return result;
  } catch (err) {
    return {
      mint,
      exists: false,
      tokenProgram: 'Unknown',
      tokenProgramId: null,
      mintAuthority: null,
      freezeAuthority: null,
      decimals: null,
      supplyUi: null,
      token2022Extensions: [],
      metadataMutable: 'unknown',
      metadataName: null,
      metadataSymbol: null,
      metadataUri: null,
      rpcEndpointLabel: label,
      errorMessage: err instanceof Error ? err.message : 'On-chain inspection failed',
    };
  }
}

export async function analyzeWalletsOnChain(
  mint: string,
  creatorWalletHint: string | null,
  mintInspection?: OnChainMintInspection
): Promise<WalletAnalytics> {
  const { label } = getRpcUrl();
  const analyzedAt = new Date().toISOString();
  const inspection = mintInspection ?? (await inspectMintOnChain(mint));
  const observationNotes: string[] = [];
  const clusterSignals: WalletClusterSignal[] = [];

  let topHolders: HolderEntry[] = [];
  let top1Pct: number | null = null;
  let top5Pct: number | null = null;
  let top10Pct: number | null = null;
  let recentMintTxs: WalletTxSummary[] = [];
  let recentCreatorTxs: WalletTxSummary[] = [];
  let creatorBalanceSol: number | null = null;
  const creatorFundingSources: WalletAnalytics['creatorFundingSources'] = [];
  let errorMessage: string | null = inspection.errorMessage;

  if (!inspection.exists) {
    return {
      mint,
      analyzedAt,
      rpcEndpointLabel: label,
      tokenProgram: inspection.tokenProgram,
      tokenProgramId: inspection.tokenProgramId,
      supplyUi: inspection.supplyUi,
      decimals: inspection.decimals,
      creatorWallet: creatorWalletHint,
      creatorBalanceSol: null,
      creatorFundingSources: [],
      topHolders: [],
      top1Pct: null,
      top5Pct: null,
      top10Pct: null,
      recentMintTxs: [],
      recentCreatorTxs: [],
      clusterSignals: [],
      observationNotes: [
        inspection.errorMessage || 'Mint account could not be resolved on Solana Mainnet.',
      ],
      errorMessage,
    };
  }

  // 1. Top 20 Token Largest Accounts
  try {
    const largest = await rpcCall<{
      value: Array<{ address: string; uiAmount: number | null; uiAmountString?: string }>;
    }>('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);

    const rawAccounts = Array.isArray(largest?.value) ? largest.value : [];
    const totalSupply = inspection.supplyUi;

    // Resolve owners for top 10 accounts in a single batched getMultipleAccounts call
    const topAddrs = rawAccounts.slice(0, 10).map((a) => a.address);
    const ownerMap = new Map<string, string>();
    if (topAddrs.length > 0) {
      try {
        const multi = await rpcCall<{
          value: Array<{
            data?: { parsed?: { info?: { owner?: string } } };
          } | null>;
        }>('getMultipleAccounts', [topAddrs, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
        topAddrs.forEach((addr, idx) => {
          const accOwner = multi?.value?.[idx]?.data?.parsed?.info?.owner;
          if (accOwner) ownerMap.set(addr, accOwner);
        });
      } catch {
        // Non-fatal: still show token account addresses
      }
    }

    topHolders = rawAccounts.map((acc, idx) => {
      const amountUi = acc.uiAmount ?? Number(acc.uiAmountString ?? 0) ?? 0;
      const pct =
        totalSupply && totalSupply > 0 ? Number(((amountUi / totalSupply) * 100).toFixed(2)) : null;
      return {
        tokenAccount: acc.address,
        owner: ownerMap.get(acc.address) ?? null,
        amountUi,
        percentageOfSupply: pct,
        rank: idx + 1,
      };
    });

    if (totalSupply && totalSupply > 0 && topHolders.length > 0) {
      top1Pct = topHolders[0]?.percentageOfSupply ?? null;
      top5Pct = Number(
        topHolders
          .slice(0, 5)
          .reduce((acc, h) => acc + (h.percentageOfSupply ?? 0), 0)
          .toFixed(2)
      );
      top10Pct = Number(
        topHolders
          .slice(0, 10)
          .reduce((acc, h) => acc + (h.percentageOfSupply ?? 0), 0)
          .toFixed(2)
      );
      observationNotes.push(
        `Top 10 token accounts hold ${top10Pct}% of total supply (note: AMM / bonding-curve vault accounts may be included in top accounts).`
      );
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Failed fetching largest holders';
  }

  // 2. Recent Mint Signatures & Same-Slot Bundle Evidence
  try {
    const sigs = await rpcCall<
      Array<{
        signature: string;
        slot: number;
        blockTime: number | null;
        err: unknown;
        memo: string | null;
      }>
    >('getSignaturesForAddress', [mint, { limit: 25, commitment: 'confirmed' }]);

    const slotCounts = new Map<number, string[]>();
    recentMintTxs = (Array.isArray(sigs) ? sigs : []).map((s) => {
      const list = slotCounts.get(s.slot) ?? [];
      list.push(s.signature);
      slotCounts.set(s.slot, list);
      return {
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
        err: Boolean(s.err),
        memo: s.memo ?? null,
        feeLamports: null,
        typeHint: s.err ? 'Failed Tx' : 'Token Activity',
      };
    });

    for (const [slot, slotSigs] of slotCounts.entries()) {
      if (slotSigs.length >= 3) {
        clusterSignals.push({
          type: 'same_slot_bundle',
          severity: slotSigs.length >= 5 ? 'critical' : 'warning',
          title: `Same-Slot Activity Cluster (Slot ${slot})`,
          evidence: `${slotSigs.length} transactions interacting with mint occurred in identical slot ${slot}, which can indicate Jito bundle coordination or high-frequency bot sniping.`,
          slot,
          addresses: [],
          signatures: slotSigs.slice(0, 6),
        });
      }
    }
  } catch (err) {
    observationNotes.push(
      `Mint signature scan incomplete: ${err instanceof Error ? err.message : 'RPC error'}`
    );
  }

  // 3. Creator Wallet Balance, History & Funding Trace (when creator wallet is known)
  if (creatorWalletHint && isValidSolanaAddress(creatorWalletHint)) {
    try {
      const bal = await rpcCall<{ value: number }>('getBalance', [
        creatorWalletHint,
        { commitment: 'confirmed' },
      ]);
      creatorBalanceSol = Number(((bal?.value ?? 0) / 1e9).toFixed(4));

      const creatorSigs = await rpcCall<
        Array<{
          signature: string;
          slot: number;
          blockTime: number | null;
          err: unknown;
          memo: string | null;
        }>
      >('getSignaturesForAddress', [creatorWalletHint, { limit: 15, commitment: 'confirmed' }]);

      recentCreatorTxs = (Array.isArray(creatorSigs) ? creatorSigs : []).map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
        err: Boolean(s.err),
        memo: s.memo ?? null,
        feeLamports: null,
        typeHint: s.err ? 'Failed Tx' : 'Creator Tx',
      }));

      // Inspect up to 2 oldest fetched transactions to detect direct SOL funding sources
      const candidateSigs = recentCreatorTxs.filter((s) => !s.err).slice(-2);
      for (const txMeta of candidateSigs) {
        try {
          const parsedTx = await rpcCall<{
            blockTime?: number | null;
            meta?: {
              preBalances?: number[];
              postBalances?: number[];
            };
            transaction?: {
              message?: {
                accountKeys?: Array<{ pubkey: string } | string>;
              };
            };
          } | null>('getTransaction', [
            txMeta.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
          ]);

          const keys =
            parsedTx?.transaction?.message?.accountKeys?.map((k) =>
              typeof k === 'string' ? k : k.pubkey
            ) ?? [];
          const pre = parsedTx?.meta?.preBalances ?? [];
          const post = parsedTx?.meta?.postBalances ?? [];
          const creatorIdx = keys.indexOf(creatorWalletHint);

          if (creatorIdx >= 0 && (post[creatorIdx] ?? 0) > (pre[creatorIdx] ?? 0)) {
            const funderIdx = pre.findIndex(
              (b, idx) => idx !== creatorIdx && (post[idx] ?? 0) < b - 10_000_000
            );
            if (funderIdx >= 0 && keys[funderIdx]) {
              creatorFundingSources.push({
                funder: keys[funderIdx],
                lamports: (post[creatorIdx] ?? 0) - (pre[creatorIdx] ?? 0),
                signature: txMeta.signature,
                blockTime: txMeta.blockTime,
              });
            }
          }
        } catch {
          // Skip individual tx inspection failures
        }
      }

      if (recentCreatorTxs.length >= 15) {
        observationNotes.push(
          `Creator wallet has at least ${recentCreatorTxs.length} recent transactions; review Solscan for full historical deployments.`
        );
      }
    } catch (err) {
      observationNotes.push(
        `Creator wallet inspection incomplete: ${err instanceof Error ? err.message : 'RPC error'}`
      );
    }
  } else {
    observationNotes.push(
      'Creator wallet address unavailable from current event metadata; wallet provenance cannot be inferred.'
    );
  }

  return {
    mint,
    analyzedAt,
    rpcEndpointLabel: label,
    tokenProgram: inspection.tokenProgram,
    tokenProgramId: inspection.tokenProgramId,
    supplyUi: inspection.supplyUi,
    decimals: inspection.decimals,
    creatorWallet: creatorWalletHint,
    creatorBalanceSol,
    creatorFundingSources,
    topHolders,
    top1Pct,
    top5Pct,
    top10Pct,
    recentMintTxs,
    recentCreatorTxs,
    clusterSignals,
    observationNotes,
    errorMessage,
  };
}

export async function inspectStandaloneWallet(address: string): Promise<{
  address: string;
  valid: boolean;
  balanceSol: number | null;
  recentTxs: WalletTxSummary[];
  fundingSources: Array<{
    funder: string;
    solAmount: number;
    signature: string;
    blockTime: string | null;
  }>;
  error: string | null;
}> {
  if (!isValidSolanaAddress(address)) {
    return {
      address,
      valid: false,
      balanceSol: null,
      recentTxs: [],
      fundingSources: [],
      error: 'Invalid Solana base58 wallet address.',
    };
  }

  try {
    const [bal, sigs] = await Promise.all([
      rpcCall<{ value: number }>('getBalance', [address, { commitment: 'confirmed' }]),
      rpcCall<
        Array<{
          signature: string;
          slot: number;
          blockTime: number | null;
          err: unknown;
          memo: string | null;
        }>
      >('getSignaturesForAddress', [address, { limit: 20, commitment: 'confirmed' }]),
    ]);

    const recentTxs: WalletTxSummary[] = (Array.isArray(sigs) ? sigs : []).map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
      err: Boolean(s.err),
      memo: s.memo ?? null,
      feeLamports: null,
      typeHint: s.err ? 'Failed Tx' : 'Confirmed Tx',
    }));

    const fundingSources: Array<{
      funder: string;
      solAmount: number;
      signature: string;
      blockTime: string | null;
    }> = [];

    for (const txMeta of recentTxs.filter((t) => !t.err).slice(-3)) {
      try {
        const parsedTx = await rpcCall<{
          meta?: { preBalances?: number[]; postBalances?: number[] };
          transaction?: { message?: { accountKeys?: Array<{ pubkey: string } | string> } };
        } | null>('getTransaction', [
          txMeta.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]);
        const keys =
          parsedTx?.transaction?.message?.accountKeys?.map((k) =>
            typeof k === 'string' ? k : k.pubkey
          ) ?? [];
        const pre = parsedTx?.meta?.preBalances ?? [];
        const post = parsedTx?.meta?.postBalances ?? [];
        const targetIdx = keys.indexOf(address);
        if (targetIdx >= 0 && (post[targetIdx] ?? 0) > (pre[targetIdx] ?? 0)) {
          const funderIdx = pre.findIndex(
            (b, idx) => idx !== targetIdx && (post[idx] ?? 0) < b - 5_000_000
          );
          if (funderIdx >= 0 && keys[funderIdx]) {
            fundingSources.push({
              funder: keys[funderIdx],
              solAmount: Number(
                (((post[targetIdx] ?? 0) - (pre[targetIdx] ?? 0)) / 1e9).toFixed(4)
              ),
              signature: txMeta.signature,
              blockTime: txMeta.blockTime,
            });
          }
        }
      } catch {
        // Ignore single tx parse failure
      }
    }

    return {
      address,
      valid: true,
      balanceSol: Number(((bal?.value ?? 0) / 1e9).toFixed(4)),
      recentTxs,
      fundingSources,
      error: null,
    };
  } catch (err) {
    return {
      address,
      valid: true,
      balanceSol: null,
      recentTxs: [],
      fundingSources: [],
      error: err instanceof Error ? err.message : 'Wallet RPC lookup failed',
    };
  }
}
