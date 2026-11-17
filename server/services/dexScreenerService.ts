import type { MarketSnapshot, TokenRecord } from '../../src/types/domain.ts';
import { store } from '../storage/store.ts';
import { eventBus } from './eventBus.ts';
import { evaluateTokenAlertRules } from './alertService.ts';

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: {
    address?: string;
    name?: string;
    symbol?: string;
  };
  quoteToken?: {
    address?: string;
    symbol?: string;
  };
  priceUsd?: string;
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  volume?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  priceChange?: {
    m5?: number;
    h1?: number;
    h6?: number;
    h24?: number;
  };
  liquidity?: {
    usd?: number;
  };
  fdv?: number;
  marketCap?: number;
  info?: {
    imageUrl?: string;
  };
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const tokenCache = new Map<string, CacheEntry<MarketSnapshot>>();
const trendingCache: { data: TokenRecord[]; expiresAt: number } = {
  data: [],
  expiresAt: 0,
};

let rateLimitedUntil = 0;

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  if (Date.now() < rateLimitedUntil) {
    throw new Error('DexScreener rate-limit cooldown active. Please retry shortly.');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 429) {
        rateLimitedUntil = Date.now() + 15000;
        store.collectorStatus.dexscreener.status = 'ERROR';
        store.collectorStatus.dexscreener.lastError = 'HTTP 429 rate limited by DexScreener';
        store.addLog('dexscreener', 'warn', 'DexScreener rate limit (429) hit; backing off 15s.');
        throw new Error('DexScreener HTTP 429 rate limit');
      }

      if (!res.ok) {
        throw new Error(`DexScreener HTTP ${res.status}`);
      }

      store.collectorStatus.dexscreener.status = 'LIVE';
      store.collectorStatus.dexscreener.lastSuccessAt = new Date().toISOString();
      store.collectorStatus.dexscreener.lastError = null;
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : 'DexScreener fetch failed';
  store.collectorStatus.dexscreener.status = 'ERROR';
  store.collectorStatus.dexscreener.lastError = msg;
  throw lastError;
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickBestSolanaPair(pairs: DexScreenerPair[] | undefined | null): DexScreenerPair | null {
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  const solPairs = pairs.filter((p) => p.chainId === 'solana');
  if (solPairs.length === 0) return null;
  return solPairs.sort((a, b) => (toNum(b.liquidity?.usd) ?? 0) - (toNum(a.liquidity?.usd) ?? 0))[0];
}

export async function enrichTokenWithDexScreener(
  mint: string,
  forceRefresh = false
): Promise<{ token: TokenRecord | null; snapshot: MarketSnapshot | null }> {
  const ttlMs = Math.max(15, store.getSettings().marketCacheTtlSeconds) * 1000;
  const cached = tokenCache.get(mint);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return { token: store.getToken(mint), snapshot: cached.data };
  }

  try {
    const res = await fetchWithRetry(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`
    );
    const json = (await res.json()) as { pairs?: DexScreenerPair[] };
    const best = pickBestSolanaPair(json.pairs);

    const fetchedAt = new Date().toISOString();
    const snapshot: MarketSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mint,
      provider: 'dexscreener',
      fetchedAt,
      priceUsd: best ? toNum(best.priceUsd) : null,
      marketCapUsd: best ? toNum(best.marketCap) : null,
      fdvUsd: best ? toNum(best.fdv) : null,
      liquidityUsd: best ? toNum(best.liquidity?.usd) : null,
      volume5mUsd: best ? toNum(best.volume?.m5) : null,
      volume1hUsd: best ? toNum(best.volume?.h1) : null,
      volume6hUsd: best ? toNum(best.volume?.h6) : null,
      volume24hUsd: best ? toNum(best.volume?.h24) : null,
      priceChange5m: best ? toNum(best.priceChange?.m5) : null,
      priceChange1h: best ? toNum(best.priceChange?.h1) : null,
      priceChange6h: best ? toNum(best.priceChange?.h6) : null,
      priceChange24h: best ? toNum(best.priceChange?.h24) : null,
      buys5m: best ? toNum(best.txns?.m5?.buys) : null,
      sells5m: best ? toNum(best.txns?.m5?.sells) : null,
      buys1h: best ? toNum(best.txns?.h1?.buys) : null,
      sells1h: best ? toNum(best.txns?.h1?.sells) : null,
      buys24h: best ? toNum(best.txns?.h24?.buys) : null,
      sells24h: best ? toNum(best.txns?.h24?.sells) : null,
      pairAddress: best?.pairAddress ?? null,
      dexId: best?.dexId ?? null,
      pairUrl: best?.url ?? null,
      baseSymbol: best?.baseToken?.symbol ?? null,
      quoteSymbol: best?.quoteToken?.symbol ?? null,
      errorMessage: best ? null : 'No active Solana pair indexed on DexScreener yet.',
    };

    tokenCache.set(mint, { data: snapshot, expiresAt: Date.now() + ttlMs });
    store.addMarketSnapshot(snapshot);
    store.collectorStatus.dexscreener.eventsReceived += 1;

    const existing = store.getToken(mint);
    if (existing) {
      const updated = store.upsertToken({
        ...existing,
        name:
          existing.name === 'Unknown Token' && best?.baseToken?.name
            ? best.baseToken.name
            : existing.name,
        symbol:
          existing.symbol === 'UNKNOWN' && best?.baseToken?.symbol
            ? best.baseToken.symbol
            : existing.symbol,
        imageUrl: best?.info?.imageUrl ?? existing.imageUrl,
        priceUsd: snapshot.priceUsd,
        marketCapUsd: snapshot.marketCapUsd,
        fdvUsd: snapshot.fdvUsd,
        liquidityUsd: snapshot.liquidityUsd,
        volume24hUsd: snapshot.volume24hUsd,
        volume1hUsd: snapshot.volume1hUsd,
        volume5mUsd: snapshot.volume5mUsd,
        priceChange5m: snapshot.priceChange5m,
        priceChange1h: snapshot.priceChange1h,
        priceChange24h: snapshot.priceChange24h,
        buys24h: snapshot.buys24h,
        sells24h: snapshot.sells24h,
        buys1h: snapshot.buys1h,
        sells1h: snapshot.sells1h,
        pairAddress: snapshot.pairAddress,
        dexId: snapshot.dexId,
        verificationStage:
          existing.verificationStage === 'Detected' && best
            ? 'Enriched'
            : existing.verificationStage,
        lastEnrichedAt: fetchedAt,
      });
      eventBus.emitStream({ type: 'token:updated', token: updated });
      await evaluateTokenAlertRules(updated, {});
      return { token: updated, snapshot };
    }

    return { token: null, snapshot };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DexScreener enrichment error';
    store.addLog('dexscreener', 'warn', `Enrich failed for ${mint}: ${msg}`);
    return { token: store.getToken(mint), snapshot: null };
  }
}

export async function fetchSolanaTrendingFromDexScreener(
  forceRefresh = false
): Promise<{ tokens: TokenRecord[]; fetchedAt: string | null; error: string | null }> {
  if (!forceRefresh && trendingCache.data.length > 0 && trendingCache.expiresAt > Date.now()) {
    return {
      tokens: trendingCache.data,
      fetchedAt: store.collectorStatus.dexscreener.lastSuccessAt,
      error: null,
    };
  }

  try {
    // Use DexScreener public boosted/top Solana endpoint (no API key needed)
    const boostRes = await fetchWithRetry('https://api.dexscreener.com/token-boosts/top/v1');
    const boostJson = (await boostRes.json()) as Array<{
      chainId?: string;
      tokenAddress?: string;
      icon?: string;
    }>;

    const solMints = Array.from(
      new Set(
        (Array.isArray(boostJson) ? boostJson : [])
          .filter((item) => item.chainId === 'solana' && item.tokenAddress)
          .map((item) => item.tokenAddress as string)
      )
    ).slice(0, 20);

    if (solMints.length === 0) {
      return {
        tokens: [],
        fetchedAt: store.collectorStatus.dexscreener.lastSuccessAt,
        error: 'No trending Solana tokens returned from DexScreener.',
      };
    }

    const batchRes = await fetchWithRetry(
      `https://api.dexscreener.com/tokens/v1/solana/${solMints.join(',')}`
    );
    const pairs = (await batchRes.json()) as DexScreenerPair[];
    const byMint = new Map<string, DexScreenerPair[]>();
    for (const pair of Array.isArray(pairs) ? pairs : []) {
      const addr = pair.baseToken?.address;
      if (!addr) continue;
      const list = byMint.get(addr) ?? [];
      list.push(pair);
      byMint.set(addr, list);
    }

    const now = new Date().toISOString();
    const results: TokenRecord[] = [];
    for (const mint of solMints) {
      const best = pickBestSolanaPair(byMint.get(mint));
      if (!best) continue;
      const existing = store.getToken(mint);
      const record: TokenRecord = store.upsertToken({
        mint,
        name: best.baseToken?.name || existing?.name || 'Unknown Token',
        symbol: best.baseToken?.symbol || existing?.symbol || 'UNKNOWN',
        creatorWallet: existing?.creatorWallet ?? null,
        source: existing?.source ?? 'manual-inspect',
        programId: existing?.programId ?? null,
        signature: existing?.signature ?? null,
        detectedAt: existing?.detectedAt ?? now,
        migrated: existing?.migrated ?? (best.dexId === 'raydium' || best.dexId === 'pumpswap'),
        migratedAt: existing?.migratedAt ?? null,
        migrationPool: existing?.migrationPool ?? best.dexId ?? null,
        initialBuySol: existing?.initialBuySol ?? null,
        marketCapSol: existing?.marketCapSol ?? null,
        vSolInBondingCurve: existing?.vSolInBondingCurve ?? null,
        vTokensInBondingCurve: existing?.vTokensInBondingCurve ?? null,
        metadataUri: existing?.metadataUri ?? null,
        imageUrl: best.info?.imageUrl ?? existing?.imageUrl ?? null,
        priceUsd: toNum(best.priceUsd),
        marketCapUsd: toNum(best.marketCap),
        fdvUsd: toNum(best.fdv),
        liquidityUsd: toNum(best.liquidity?.usd),
        volume24hUsd: toNum(best.volume?.h24),
        volume1hUsd: toNum(best.volume?.h1),
        volume5mUsd: toNum(best.volume?.m5),
        priceChange5m: toNum(best.priceChange?.m5),
        priceChange1h: toNum(best.priceChange?.h1),
        priceChange24h: toNum(best.priceChange?.h24),
        buys24h: toNum(best.txns?.h24?.buys),
        sells24h: toNum(best.txns?.h24?.sells),
        buys1h: toNum(best.txns?.h1?.buys),
        sells1h: toNum(best.txns?.h1?.sells),
        pairAddress: best.pairAddress ?? null,
        dexId: best.dexId ?? null,
        riskScore: existing?.riskScore ?? null,
        riskCategory: existing?.riskCategory ?? 'Unknown',
        verificationStage: existing?.verificationStage ?? 'Enriched',
        isDemo: false,
        lastEnrichedAt: now,
        lastAnalyzedAt: existing?.lastAnalyzedAt ?? null,
        updatedAt: now,
      });
      results.push(record);
    }

    trendingCache.data = results;
    trendingCache.expiresAt = Date.now() + 90_000;
    return { tokens: results, fetchedAt: now, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Trending fetch failed';
    store.addLog('dexscreener', 'warn', `Trending fetch error: ${msg}`);
    return {
      tokens: trendingCache.data,
      fetchedAt: store.collectorStatus.dexscreener.lastSuccessAt,
      error: msg,
    };
  }
}
