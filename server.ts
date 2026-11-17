import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type {
  MonitoredProgram,
  OverviewResponse,
  TokenDetailResponse,
  TokenEvent,
  TokenRecord,
} from './src/types/domain.ts';
import { sendTestTelegramAlert } from './server/services/alertService.ts';
import {
  enrichTokenWithDexScreener,
  fetchSolanaTrendingFromDexScreener,
} from './server/services/dexScreenerService.ts';
import { eventBus } from './server/services/eventBus.ts';
import { generateOnDemandTokenBrief } from './server/services/geminiBriefService.ts';
import { heliusCollector } from './server/services/heliusCollector.ts';
import { pumpportalCollector } from './server/services/pumpportalCollector.ts';
import {
  inspectStandaloneWallet,
  isValidSolanaAddress,
} from './server/services/solanaOnChainService.ts';
import { inspectAndAnalyzeMint } from './server/services/tokenAnalyzer.ts';
import { store } from './server/storage/store.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

function getWorkspaceId(req: express.Request): string {
  const headerVal = req.header('x-workspace-id')?.trim();
  if (headerVal && /^[a-zA-Z0-9_-]{3,64}$/.test(headerVal)) {
    return headerVal;
  }
  return 'default-operator';
}

function isAdminAuthorized(req: express.Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) return true; // Local operator mode when ADMIN_SECRET is unset
  const provided = req.header('x-admin-token')?.trim();
  return provided === adminSecret;
}

function loadClearlyMarkedDemoSample(): void {
  const now = new Date();
  const sampleItems: Array<{
    mint: string;
    name: string;
    symbol: string;
    creator: string;
    migrated: boolean;
    vSol: number;
  }> = [
    {
      mint: 'DemoSo1111111111111111111111111111111111111',
      name: 'DEMO Obsidian Cat',
      symbol: 'DEMOCAT',
      creator: 'DemoCreator1111111111111111111111111111111',
      migrated: false,
      vSol: 42.5,
    },
    {
      mint: 'DemoRay2222222222222222222222222222222222222',
      name: 'DEMO Gold Protocol',
      symbol: 'DEMOGOLD',
      creator: 'DemoCreator2222222222222222222222222222222',
      migrated: true,
      vSol: 85.0,
    },
  ];

  sampleItems.forEach((item, idx) => {
    const ts = new Date(now.getTime() - idx * 90_000).toISOString();
    const ev: TokenEvent = {
      id: `demo_evt_${idx}_${Date.now()}`,
      mint: item.mint,
      signature: `demo_sig_${idx}_${Date.now()}`,
      eventType: 'demo',
      source: 'demo-sample',
      detectedAt: ts,
      creatorWallet: item.creator,
      rawPayload: {
        notice: 'DEMO RECORD - Live PumpPortal stream unaffected',
        mint: item.mint,
        name: item.name,
        symbol: item.symbol,
      },
      isDemo: true,
    };
    store.addTokenEvent(ev);

    const rec: TokenRecord = {
      mint: item.mint,
      name: item.name,
      symbol: item.symbol,
      creatorWallet: item.creator,
      source: 'demo-sample',
      programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
      signature: ev.signature,
      detectedAt: ts,
      migrated: item.migrated,
      migratedAt: item.migrated ? ts : null,
      migrationPool: item.migrated ? 'pumpswap-demo' : null,
      initialBuySol: 1.5,
      marketCapSol: 34.2,
      vSolInBondingCurve: item.vSol,
      vTokensInBondingCurve: 780_000_000,
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
      verificationStage: 'Unverified',
      isDemo: true,
      lastEnrichedAt: null,
      lastAnalyzedAt: null,
      updatedAt: ts,
    };
    store.upsertToken(rec);
  });
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'ALFITOMS FOR DEGEN',
      network: 'solana-mainnet',
      collectorStatus: store.collectorStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // Real-time Server-Sent Events stream for live radar, migrations, alerts, and status
  app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (data: unknown) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ type: 'snapshot', status: store.collectorStatus });

    const listener = (payload: unknown) => {
      sendEvent(payload);
    };
    eventBus.on('stream', listener);

    const keepAlive = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 20_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      eventBus.off('stream', listener);
    });
  });

  // Overview Dashboard Endpoint
  app.get('/api/overview', (req, res) => {
    const workspaceId = getWorkspaceId(req);
    const settings = store.getSettings();
    const allTokens = store.getAllTokens(settings.demoSampleEnabled);
    const realTokens = allTokens.filter((t) => !t.isDemo);

    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).getTime();

    const detectedToday = realTokens.filter(
      (t) => new Date(t.detectedAt).getTime() >= startOfDay
    );
    const newLaunches = detectedToday.filter((t) => t.source === 'pumpportal-create');
    const migratedTokens = realTokens.filter((t) => t.migrated);
    const totalMonitoredVolumeUsd = realTokens.reduce(
      (sum, t) => sum + (t.volume24hUsd ?? 0),
      0
    );

    const alerts = store.getAlerts(workspaceId);
    const highRiskAlerts = alerts.filter(
      (a) => a.type === 'high_risk' || a.severity === 'critical'
    ).length;

    const trendingTokens = [...realTokens]
      .filter((t) => (t.volume24hUsd ?? 0) > 0 || (t.liquidityUsd ?? 0) > 0)
      .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
      .slice(0, 8);

    const largeEvents = store
      .getRecentEvents(80)
      .filter((e) => !e.isDemo)
      .slice(0, 12);

    const payload: OverviewResponse = {
      metrics: {
        totalDetectedTokens: realTokens.length,
        tokensDetectedToday: detectedToday.length,
        newLaunches: newLaunches.length,
        migratedTokens: migratedTokens.length,
        totalMonitoredVolumeUsd,
        highRiskAlerts,
      },
      collectorStatus: store.collectorStatus,
      latestTokens: allTokens.slice(0, 14),
      recentMigrations: allTokens.filter((t) => t.migrated).slice(0, 10),
      trendingTokens,
      recentAlerts: alerts.slice(0, 10),
      recentLargeEvents: largeEvents,
      monitoredPrograms: store.getMonitoredPrograms(),
    };

    res.json(payload);
  });

  // Paginated, Searchable, Sortable Token Radar
  app.get('/api/tokens', (req, res) => {
    const settings = store.getSettings();
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const source = String(req.query.source ?? 'all');
    const risk = String(req.query.risk ?? 'all');
    const sortBy = String(req.query.sortBy ?? 'detectedAt');
    const sortDir = String(req.query.sortDir ?? 'desc') === 'asc' ? 1 : -1;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize ?? 25)));

    let items = store.getAllTokens(settings.demoSampleEnabled);

    if (q) {
      items = items.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.symbol.toLowerCase().includes(q) ||
          t.mint.toLowerCase().includes(q) ||
          (t.creatorWallet && t.creatorWallet.toLowerCase().includes(q))
      );
    }

    if (source !== 'all') {
      if (source === 'migrated') {
        items = items.filter((t) => t.migrated);
      } else {
        items = items.filter((t) => t.source === source);
      }
    }

    if (risk !== 'all') {
      items = items.filter((t) => t.riskCategory.toLowerCase() === risk.toLowerCase());
    }

    items.sort((a, b) => {
      if (sortBy === 'volume') {
        return ((a.volume24hUsd ?? -1) - (b.volume24hUsd ?? -1)) * sortDir;
      }
      if (sortBy === 'liquidity') {
        return ((a.liquidityUsd ?? -1) - (b.liquidityUsd ?? -1)) * sortDir;
      }
      if (sortBy === 'marketCap') {
        return ((a.marketCapUsd ?? -1) - (b.marketCapUsd ?? -1)) * sortDir;
      }
      if (sortBy === 'riskScore') {
        return ((a.riskScore ?? -1) - (b.riskScore ?? -1)) * sortDir;
      }
      return (
        (new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime()) * sortDir
      );
    });

    const total = items.length;
    const start = (page - 1) * pageSize;
    const paginated = items.slice(start, start + pageSize);

    res.json({
      items: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  });

  // Token Detail Dossier
  app.get('/api/tokens/:mint', (req, res) => {
    const mint = req.params.mint.trim();
    const workspaceId = getWorkspaceId(req);
    const token = store.getToken(mint);
    if (!token) {
      res.status(404).json({ error: 'Token not currently in local store. Run Inspect Mint to scan live on Solana Mainnet.' });
      return;
    }

    const detail: TokenDetailResponse = {
      token,
      events: store.getEventsForMint(mint),
      marketSnapshots: store.getMarketSnapshots(mint),
      walletAnalytics: store.getWalletAnalytics(mint),
      riskAssessment: store.getRiskAssessment(mint),
      inWatchlist: store.isInWatchlist(workspaceId, mint),
    };
    res.json(detail);
  });

  // Inspect ANY Solana Mainnet Mint Address
  app.post('/api/tokens/inspect', async (req, res) => {
    try {
      const mint = String(req.body?.mint ?? '').trim();
      if (!isValidSolanaAddress(mint)) {
        res.status(400).json({ error: 'Please provide a valid Solana Mainnet base58 mint address.' });
        return;
      }
      const result = await inspectAndAnalyzeMint(mint, { forceRefresh: true });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to inspect token mint.',
      });
    }
  });

  // Enrich single token via DexScreener
  app.post('/api/tokens/:mint/enrich', async (req, res) => {
    try {
      const mint = req.params.mint.trim();
      const result = await enrichTokenWithDexScreener(mint, true);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Market enrichment failed.',
      });
    }
  });

  // Run deterministic On-Chain Wallet & Risk Scan
  app.post('/api/tokens/:mint/analyze', async (req, res) => {
    try {
      const mint = req.params.mint.trim();
      const result = await inspectAndAnalyzeMint(mint, { forceRefresh: true });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'On-chain risk scan failed.',
      });
    }
  });

  // On-demand Gemini AI Research Brief (NEVER runs automatically)
  app.post('/api/tokens/:mint/ai-brief', async (req, res) => {
    try {
      const mint = req.params.mint.trim();
      let token = store.getToken(mint);
      let risk = store.getRiskAssessment(mint);
      let wallet = store.getWalletAnalytics(mint);

      if (!token || !risk) {
        const scanned = await inspectAndAnalyzeMint(mint, { forceRefresh: false });
        token = scanned.token;
        risk = scanned.riskAssessment;
        wallet = scanned.walletAnalytics;
      }

      const brief = await generateOnDemandTokenBrief({ token, risk, wallet });
      const updatedRisk = {
        ...risk,
        aiSummary: brief.summary,
        aiGeneratedAt: brief.generatedAt,
      };
      store.setRiskAssessment(mint, updatedRisk);
      res.json(updatedRisk);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Gemini brief generation failed.',
      });
    }
  });

  // Trending Tokens (DexScreener Boosted Solana + Local Tracked)
  app.get('/api/trending', async (req, res) => {
    const force = req.query.refresh === 'true';
    const liveTrending = await fetchSolanaTrendingFromDexScreener(force);
    const localTokens = store.getAllTokens(false);

    const byVolume = [...localTokens]
      .filter((t) => (t.volume24hUsd ?? 0) > 0)
      .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
      .slice(0, 15);

    const byLiquidity = [...localTokens]
      .filter((t) => (t.liquidityUsd ?? 0) > 0)
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
      .slice(0, 15);

    const byPriceMove = [...localTokens]
      .filter((t) => t.priceChange1h !== null || t.priceChange24h !== null)
      .sort(
        (a, b) =>
          Math.abs(b.priceChange1h ?? b.priceChange24h ?? 0) -
          Math.abs(a.priceChange1h ?? a.priceChange24h ?? 0)
      )
      .slice(0, 15);

    const newestLaunches = localTokens.slice(0, 15);

    res.json({
      dexScreenerTrending: liveTrending.tokens,
      fetchedAt: liveTrending.fetchedAt,
      error: liveTrending.error,
      byVolume,
      byLiquidity,
      byPriceMove,
      newestLaunches,
    });
  });

  // Market Analytics Aggregations
  app.get('/api/analytics', (req, res) => {
    const range = String(req.query.range ?? '24h');
    const tokens = store.getAllTokens(false);
    const enriched = tokens.filter(
      (t) => t.volume24hUsd !== null || t.liquidityUsd !== null
    );

    const totalVolume24h = enriched.reduce((s, t) => s + (t.volume24hUsd ?? 0), 0);
    const totalVolume1h = enriched.reduce((s, t) => s + (t.volume1hUsd ?? 0), 0);
    const totalVolume5m = enriched.reduce((s, t) => s + (t.volume5mUsd ?? 0), 0);
    const totalLiquidity = enriched.reduce((s, t) => s + (t.liquidityUsd ?? 0), 0);

    const buys24h = enriched.reduce((s, t) => s + (t.buys24h ?? 0), 0);
    const sells24h = enriched.reduce((s, t) => s + (t.sells24h ?? 0), 0);
    const buys1h = enriched.reduce((s, t) => s + (t.buys1h ?? 0), 0);
    const sells1h = enriched.reduce((s, t) => s + (t.sells1h ?? 0), 0);

    // Time bucket activity from real detected token events
    const rangeHours = range === '1h' ? 1 : range === '6h' ? 6 : 24;
    const bucketsCount = range === '1h' ? 12 : range === '6h' ? 12 : 12;
    const bucketMs = (rangeHours * 3600 * 1000) / bucketsCount;
    const nowMs = Date.now();
    const startMs = nowMs - rangeHours * 3600 * 1000;

    const activitySeries = Array.from({ length: bucketsCount }, (_, i) => {
      const bStart = startMs + i * bucketMs;
      const bEnd = bStart + bucketMs;
      const inBucket = tokens.filter((t) => {
        const ts = new Date(t.detectedAt).getTime();
        return ts >= bStart && ts < bEnd;
      });
      return {
        label: new Date(bEnd).toISOString().slice(11, 16),
        launches: inBucket.filter((t) => !t.migrated).length,
        migrations: inBucket.filter((t) => t.migrated).length,
        volumeUsd: inBucket.reduce((s, t) => s + (t.volume24hUsd ?? 0), 0),
      };
    });

    const unusualVolume = [...enriched]
      .filter((t) => (t.liquidityUsd ?? 0) > 0 && (t.volume1hUsd ?? 0) > 0)
      .map((t) => ({
        token: t,
        volToLiqRatio: Number(
          (((t.volume1hUsd ?? 0) / Math.max(1, t.liquidityUsd ?? 1)) * 100).toFixed(1)
        ),
      }))
      .sort((a, b) => b.volToLiqRatio - a.volToLiqRatio)
      .slice(0, 10);

    res.json({
      range,
      summary: {
        trackedTokens: tokens.length,
        enrichedTokens: enriched.length,
        totalVolume24h,
        totalVolume1h,
        totalVolume5m,
        totalLiquidity,
        buys24h,
        sells24h,
        buys1h,
        sells1h,
      },
      activitySeries,
      unusualVolume,
      topByLiquidity: [...enriched]
        .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
        .slice(0, 10),
    });
  });

  // Standalone Wallet Intelligence Lookup
  app.get('/api/wallets/:address', async (req, res) => {
    const address = req.params.address.trim();
    const result = await inspectStandaloneWallet(address);
    const createdTokens = store
      .getAllTokens(false)
      .filter((t) => t.creatorWallet === address);

    res.json({
      ...result,
      createdTokens,
    });
  });

  // Watchlist Endpoints (Workspace-scoped)
  app.get('/api/watchlist', (req, res) => {
    const workspaceId = getWorkspaceId(req);
    res.json({ items: store.getWatchlist(workspaceId) });
  });

  app.post('/api/watchlist', (req, res) => {
    const workspaceId = getWorkspaceId(req);
    const mint = String(req.body?.mint ?? '').trim();
    if (!mint) {
      res.status(400).json({ error: 'Mint address is required.' });
      return;
    }
    const existingToken = store.getToken(mint);
    const item = store.upsertWatchlistItem({
      id: `wl_${workspaceId}_${mint}`,
      workspaceId,
      mint,
      symbol: String(req.body?.symbol ?? existingToken?.symbol ?? 'UNKNOWN').slice(0, 24),
      name: String(req.body?.name ?? existingToken?.name ?? 'Unknown Token').slice(0, 64),
      addedAt: new Date().toISOString(),
      notes: String(req.body?.notes ?? '').slice(0, 280),
    });
    res.json(item);
  });

  app.delete('/api/watchlist/:mint', (req, res) => {
    const workspaceId = getWorkspaceId(req);
    const removed = store.removeWatchlistItem(workspaceId, req.params.mint.trim());
    res.json({ removed });
  });

  // Alert Center Endpoints
  app.get('/api/alerts', (req, res) => {
    const workspaceId = getWorkspaceId(req);
    res.json({
      alerts: store.getAlerts(workspaceId),
      rules: store.getSettings().alertRules,
      telegramConfigured: Boolean(
        process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()
      ),
    });
  });

  app.post('/api/alerts/:id/read', (req, res) => {
    const ok = store.markAlertRead(req.params.id);
    res.json({ ok });
  });

  app.post('/api/alerts/read-all', (_req, res) => {
    store.markAllAlertsRead();
    res.json({ ok: true });
  });

  app.post('/api/alerts/rules', (req, res) => {
    const current = store.getSettings();
    const next = store.updateSettings({
      alertRules: {
        ...current.alertRules,
        ...req.body,
      },
    });
    res.json(next.alertRules);
  });

  app.post('/api/alerts/test-telegram', async (_req, res) => {
    const result = await sendTestTelegramAlert();
    res.status(result.ok ? 200 : 400).json(result);
  });

  // Collector Health, Logs & Controls
  app.get('/api/collector/status', (_req, res) => {
    res.json(store.collectorStatus);
  });

  app.get('/api/collector/logs', (req, res) => {
    const limit = Math.min(250, Math.max(20, Number(req.query.limit ?? 80)));
    res.json({ logs: store.getLogs(limit) });
  });

  app.post('/api/collector/reconnect', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Admin authorization required.' });
      return;
    }
    pumpportalCollector.reconnectNow();
    heliusCollector.syncWithSettings();
    res.json({ ok: true, status: store.collectorStatus });
  });

  app.post('/api/collector/demo', (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    if (enabled) {
      loadClearlyMarkedDemoSample();
    } else {
      store.clearDemoTokens();
    }
    const settings = store.updateSettings({ demoSampleEnabled: enabled });
    res.json({ ok: true, demoSampleEnabled: settings.demoSampleEnabled });
  });

  // Monitored Programs Configuration (Protected by ADMIN_SECRET when configured)
  app.get('/api/programs', (_req, res) => {
    res.json({ programs: store.getMonitoredPrograms() });
  });

  app.post('/api/programs', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Admin authorization required.' });
      return;
    }
    const programId = String(req.body?.programId ?? '').trim();
    const name = String(req.body?.name ?? '').trim();
    if (!isValidSolanaAddress(programId) || !name) {
      res.status(400).json({ error: 'Valid Solana programId and name are required.' });
      return;
    }
    const prog: MonitoredProgram = {
      id: `prog_${Date.now()}`,
      name: name.slice(0, 64),
      programId,
      category: req.body?.category ?? 'custom',
      enabled: Boolean(req.body?.enabled ?? true),
      activeSource: req.body?.activeSource ?? 'helius_ws',
      notes: String(req.body?.notes ?? '').slice(0, 200),
      createdAt: new Date().toISOString(),
    };
    store.addMonitoredProgram(prog);
    heliusCollector.syncWithSettings();
    res.json(prog);
  });

  app.patch('/api/programs/:id', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Admin authorization required.' });
      return;
    }
    const updated = store.updateMonitoredProgram(req.params.id, {
      enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
      notes: typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 200) : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: 'Program not found.' });
      return;
    }
    heliusCollector.syncWithSettings();
    res.json(updated);
  });

  app.delete('/api/programs/:id', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Admin authorization required.' });
      return;
    }
    const deleted = store.deleteMonitoredProgram(req.params.id);
    heliusCollector.syncWithSettings();
    res.json({ deleted });
  });

  // Platform Settings (No API keys returned or accepted from frontend!)
  app.get('/api/settings', (_req, res) => {
    res.json({
      settings: store.getSettings(),
      capabilities: {
        heliusKeyConfigured: Boolean(process.env.HELIUS_API_KEY?.trim()),
        pumpPortalKeyConfigured: Boolean(process.env.PUMPPORTAL_API_KEY?.trim()),
        telegramConfigured: Boolean(
          process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()
        ),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        adminSecretRequired: Boolean(process.env.ADMIN_SECRET?.trim()),
      },
    });
  });

  app.patch('/api/settings', (req, res) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Admin authorization required.' });
      return;
    }
    const patch = req.body ?? {};
    const updated = store.updateSettings({
      heliusStreamEnabled:
        typeof patch.heliusStreamEnabled === 'boolean'
          ? patch.heliusStreamEnabled
          : undefined,
      pumpPortalAutoReconnect:
        typeof patch.pumpPortalAutoReconnect === 'boolean'
          ? patch.pumpPortalAutoReconnect
          : undefined,
      marketCacheTtlSeconds:
        typeof patch.marketCacheTtlSeconds === 'number'
          ? Math.min(300, Math.max(15, patch.marketCacheTtlSeconds))
          : undefined,
      alertRules: patch.alertRules,
    });
    heliusCollector.syncWithSettings();
    res.json(updated);
  });

  // Frontend Delivery (Vite Middleware in Dev, Static dist/ in Prod)
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ALFITOMS FOR DEGEN] Server running on http://0.0.0.0:${PORT}`);
    // Boot persistent server-side WebSocket collectors
    pumpportalCollector.start();
    heliusCollector.syncWithSettings();
  });
}

void startServer();
