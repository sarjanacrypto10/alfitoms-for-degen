import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  AlertItem,
  CollectorLogEntry,
  CollectorStatusState,
  MarketSnapshot,
  MonitoredProgram,
  PlatformSettings,
  RiskAssessment,
  TokenEvent,
  TokenRecord,
  WalletAnalytics,
  WatchlistItem,
} from '../../src/types/domain.ts';

export const IS_SERVERLESS = Boolean(
  process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NETLIFY
);

interface PersistedDatabase {
  tokens: Record<string, TokenRecord>;
  tokenEvents: TokenEvent[];
  marketSnapshots: Record<string, MarketSnapshot[]>;
  walletAnalytics: Record<string, WalletAnalytics>;
  riskAssessments: Record<string, RiskAssessment>;
  watchlists: WatchlistItem[];
  alerts: AlertItem[];
  collectorLogs: CollectorLogEntry[];
  monitoredPrograms: MonitoredProgram[];
  settings: PlatformSettings;
}

function resolveWritableDataDir(): string {
  const localDir = path.resolve(process.cwd(), 'data');
  const tmpDir = path.join(os.tmpdir(), 'alfitoms-data');
  if (IS_SERVERLESS) {
    return tmpDir;
  }
  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    return tmpDir;
  }
}

const DATA_DIR = resolveWritableDataDir();
const DB_PATH = path.join(DATA_DIR, 'alfitoms-db.json');

const DEFAULT_PROGRAMS: MonitoredProgram[] = [
  {
    id: 'prog_pumpfun',
    name: 'Pump.fun Bonding Curve',
    programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    category: 'launchpad',
    enabled: true,
    activeSource: 'pumpportal_ws',
    notes: 'Primary real-time Pump.fun token creation & migration feed via PumpPortal WS.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prog_pumpswap_migration',
    name: 'Pump.fun AMM / Migration',
    programId: '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg',
    category: 'amm',
    enabled: true,
    activeSource: 'pumpportal_ws',
    notes: 'Tracks bonding-curve graduation / migration events.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prog_raydium_v4',
    name: 'Raydium Liquidity Pool V4',
    programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    category: 'amm',
    enabled: false,
    activeSource: 'helius_ws',
    notes: 'Requires HELIUS_API_KEY + Helius stream enabled for real-time logsSubscribe.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prog_meteora_dlmm',
    name: 'Meteora DLMM Pools',
    programId: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
    category: 'amm',
    enabled: false,
    activeSource: 'helius_ws',
    notes: 'Requires HELIUS_API_KEY + Helius stream enabled for real-time logsSubscribe.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prog_token_2022',
    name: 'Solana Token-2022 Program',
    programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
    category: 'token_program',
    enabled: true,
    activeSource: 'rpc_inspection_only',
    notes: 'Parsed deterministically via Solana RPC during token risk & extension audits.',
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_SETTINGS: PlatformSettings = {
  heliusStreamEnabled: false, // Paid/metered subscriptions disabled by default
  pumpPortalAutoReconnect: true,
  demoSampleEnabled: false,
  marketCacheTtlSeconds: 45,
  alertRules: {
    alertOnMigration: true,
    alertOnHighRiskScore: 65,
    alertOnVolumeUsd: 25000,
    alertOnLiquidityUsd: 10000,
    alertOnNewToken: false,
    telegramEnabled: false,
  },
  updatedAt: new Date().toISOString(),
};

function createEmptyDb(): PersistedDatabase {
  return {
    tokens: {},
    tokenEvents: [],
    marketSnapshots: {},
    walletAnalytics: {},
    riskAssessments: {},
    watchlists: [],
    alerts: [],
    collectorLogs: [],
    monitoredPrograms: DEFAULT_PROGRAMS,
    settings: DEFAULT_SETTINGS,
  };
}

class TerminalStore {
  private db: PersistedDatabase;
  private saveTimer: NodeJS.Timeout | null = null;
  private signatureSet: Set<string> = new Set();

  public collectorStatus: CollectorStatusState;

  constructor() {
    this.db = this.loadFromDisk();
    for (const ev of this.db.tokenEvents) {
      if (ev.signature) {
        this.signatureSet.add(`${ev.mint}:${ev.signature}`);
      }
    }

    const hasHeliusKey = Boolean(process.env.HELIUS_API_KEY?.trim());
    const hasTelegramCreds = Boolean(
      process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()
    );

    const pumpEvents = this.db.tokenEvents.filter(
      (e) =>
        !e.isDemo &&
        (e.source === 'pumpportal-create' || e.source === 'pumpportal-migration')
    );
    const latestPumpEventAt = pumpEvents.length > 0 ? pumpEvents[0].detectedAt : null;

    this.collectorStatus = {
      pumpportal: {
        name: 'pumpportal',
        label: 'PumpPortal WebSocket',
        status: IS_SERVERLESS ? 'DISCONNECTED' : 'CONNECTING',
        enabled: !IS_SERVERLESS,
        requiresKey: false,
        hasKeyConfigured: Boolean(process.env.PUMPPORTAL_API_KEY?.trim()),
        endpoint: 'wss://pumpportal.fun/api/data',
        lastConnectedAt: null,
        lastHeartbeatAt: null,
        lastEventAt: latestPumpEventAt,
        lastSuccessAt: latestPumpEventAt,
        reconnectCount: 0,
        eventsReceived: pumpEvents.length,
        persistedEventsCount: pumpEvents.length,
        subscribedMethods: ['subscribeNewToken', 'subscribeMigration'],
        subscriptionsAcked: { newToken: false, migration: false },
        lastError: IS_SERVERLESS
          ? 'Serverless runtime cannot sustain a persistent WebSocket. Deploy worker.ts on an always-on host and set COLLECTOR_WORKER_URL or VITE_API_BASE_URL.'
          : null,
      },
      helius: {
        name: 'helius',
        label: 'Helius Mainnet Stream',
        status: 'OPTIONAL / SKIPPED',
        enabled: false,
        requiresKey: false,
        hasKeyConfigured: hasHeliusKey,
        endpoint: 'wss://mainnet.helius-rpc.com',
        lastConnectedAt: null,
        lastHeartbeatAt: null,
        lastEventAt: null,
        lastSuccessAt: null,
        reconnectCount: 0,
        eventsReceived: 0,
        lastError:
          'Helius integration skipped (OPTIONAL / SKIPPED). PumpPortal runs standalone without HELIUS_API_KEY.',
      },
      dexscreener: {
        name: 'dexscreener',
        label: 'DexScreener Market API',
        status: 'LIVE',
        enabled: true,
        requiresKey: false,
        hasKeyConfigured: true,
        endpoint: 'https://api.dexscreener.com',
        lastConnectedAt: null,
        lastHeartbeatAt: null,
        lastEventAt: null,
        lastSuccessAt: null,
        reconnectCount: 0,
        eventsReceived: 0,
        lastError: null,
      },
      solanaRpc: {
        name: 'solana_rpc',
        label: hasHeliusKey ? 'Helius Solana RPC' : 'Solana Mainnet Public RPC',
        status: 'LIVE',
        enabled: true,
        requiresKey: false,
        hasKeyConfigured: hasHeliusKey,
        endpoint: hasHeliusKey
          ? 'https://mainnet.helius-rpc.com'
          : process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com',
        lastConnectedAt: null,
        lastHeartbeatAt: null,
        lastEventAt: null,
        lastSuccessAt: null,
        reconnectCount: 0,
        eventsReceived: 0,
        lastError: null,
      },
      telegram: {
        name: 'telegram',
        label: 'Telegram Alert Bot',
        status: hasTelegramCreds ? 'LIVE' : 'DISCONNECTED',
        enabled: this.db.settings.alertRules.telegramEnabled && hasTelegramCreds,
        requiresKey: true,
        hasKeyConfigured: hasTelegramCreds,
        endpoint: 'https://api.telegram.org',
        lastConnectedAt: null,
        lastHeartbeatAt: null,
        lastEventAt: null,
        lastSuccessAt: null,
        reconnectCount: 0,
        eventsReceived: 0,
        lastError: hasTelegramCreds
          ? null
          : 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.',
      },
      totalDetectedTokens: 0,
      tokensDetectedToday: 0,
      newLaunchesToday: 0,
      migratedTokensTotal: 0,
      activeMonitoringScope: [],
      updatedAt: new Date().toISOString(),
    };
    this.recomputeStatusCounters();
  }

  private loadFromDisk(): PersistedDatabase {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fs.existsSync(DB_PATH)) {
        const fresh = createEmptyDb();
        try {
          fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2), 'utf8');
        } catch {
          // Non-fatal if filesystem is ephemeral/read-only
        }
        return fresh;
      }
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedDatabase>;
      return {
        tokens: parsed.tokens ?? {},
        tokenEvents: Array.isArray(parsed.tokenEvents) ? parsed.tokenEvents : [],
        marketSnapshots: parsed.marketSnapshots ?? {},
        walletAnalytics: parsed.walletAnalytics ?? {},
        riskAssessments: parsed.riskAssessments ?? {},
        watchlists: Array.isArray(parsed.watchlists) ? parsed.watchlists : [],
        alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
        collectorLogs: Array.isArray(parsed.collectorLogs) ? parsed.collectorLogs : [],
        monitoredPrograms:
          Array.isArray(parsed.monitoredPrograms) && parsed.monitoredPrograms.length > 0
            ? parsed.monitoredPrograms
            : DEFAULT_PROGRAMS,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings ?? {}),
          alertRules: {
            ...DEFAULT_SETTINGS.alertRules,
            ...(parsed.settings?.alertRules ?? {}),
          },
        },
      };
    } catch (err) {
      console.error('Failed to load persisted store, initializing fresh store:', err);
      return createEmptyDb();
    }
  }

  private schedulePersist(): void {
    if (IS_SERVERLESS) {
      // Persist synchronously in serverless before invocation ends
      this.persistNow();
      return;
    }
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistNow();
    }, 1500);
  }

  public persistNow(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Enforce storage caps to keep historical data efficient
      const tokenList = Object.values(this.db.tokens).sort(
        (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
      );
      if (tokenList.length > 1200) {
        const keep = tokenList.slice(0, 1200);
        const keepMints = new Set(keep.map((t) => t.mint));
        // Always retain watchlisted mints
        for (const w of this.db.watchlists) {
          keepMints.add(w.mint);
        }
        for (const mint of Object.keys(this.db.tokens)) {
          if (!keepMints.has(mint)) {
            delete this.db.tokens[mint];
            delete this.db.marketSnapshots[mint];
            delete this.db.walletAnalytics[mint];
            delete this.db.riskAssessments[mint];
          }
        }
      }

      if (this.db.tokenEvents.length > 2500) {
        this.db.tokenEvents = this.db.tokenEvents.slice(0, 2500);
      }
      if (this.db.alerts.length > 500) {
        this.db.alerts = this.db.alerts.slice(0, 500);
      }
      if (this.db.collectorLogs.length > 400) {
        this.db.collectorLogs = this.db.collectorLogs.slice(0, 400);
      }

      const tmpPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.db), 'utf8');
      fs.renameSync(tmpPath, DB_PATH);
    } catch (err) {
      console.error('Failed to persist store:', err);
    }
  }

  public hasEvent(mint: string, signature: string): boolean {
    if (!signature) return false;
    return this.signatureSet.has(`${mint}:${signature}`);
  }

  public addTokenEvent(event: TokenEvent): boolean {
    const key = `${event.mint}:${event.signature}`;
    if (event.signature && this.signatureSet.has(key)) {
      return false;
    }
    if (event.signature) {
      this.signatureSet.add(key);
    }
    this.db.tokenEvents.unshift(event);
    if (this.db.tokenEvents.length > 3000) {
      this.db.tokenEvents.length = 3000;
    }
    this.schedulePersist();
    return true;
  }

  public upsertToken(token: TokenRecord): TokenRecord {
    const existing = this.db.tokens[token.mint];
    const merged: TokenRecord = existing
      ? {
          ...existing,
          ...token,
          // Preserve richest available non-null values
          name: token.name && token.name !== 'Unknown Token' ? token.name : existing.name,
          symbol: token.symbol && token.symbol !== 'UNKNOWN' ? token.symbol : existing.symbol,
          creatorWallet: token.creatorWallet ?? existing.creatorWallet,
          detectedAt: existing.detectedAt < token.detectedAt ? existing.detectedAt : token.detectedAt,
          migrated: existing.migrated || token.migrated,
          migratedAt: token.migratedAt ?? existing.migratedAt,
          migrationPool: token.migrationPool ?? existing.migrationPool,
          priceUsd: token.priceUsd ?? existing.priceUsd,
          marketCapUsd: token.marketCapUsd ?? existing.marketCapUsd,
          fdvUsd: token.fdvUsd ?? existing.fdvUsd,
          liquidityUsd: token.liquidityUsd ?? existing.liquidityUsd,
          volume24hUsd: token.volume24hUsd ?? existing.volume24hUsd,
          volume1hUsd: token.volume1hUsd ?? existing.volume1hUsd,
          volume5mUsd: token.volume5mUsd ?? existing.volume5mUsd,
          priceChange5m: token.priceChange5m ?? existing.priceChange5m,
          priceChange1h: token.priceChange1h ?? existing.priceChange1h,
          priceChange24h: token.priceChange24h ?? existing.priceChange24h,
          buys24h: token.buys24h ?? existing.buys24h,
          sells24h: token.sells24h ?? existing.sells24h,
          buys1h: token.buys1h ?? existing.buys1h,
          sells1h: token.sells1h ?? existing.sells1h,
          pairAddress: token.pairAddress ?? existing.pairAddress,
          dexId: token.dexId ?? existing.dexId,
          imageUrl: token.imageUrl ?? existing.imageUrl,
          metadataUri: token.metadataUri ?? existing.metadataUri,
          riskScore: token.riskScore ?? existing.riskScore,
          riskCategory:
            token.riskCategory !== 'Unknown' ? token.riskCategory : existing.riskCategory,
          lastEnrichedAt: token.lastEnrichedAt ?? existing.lastEnrichedAt,
          lastAnalyzedAt: token.lastAnalyzedAt ?? existing.lastAnalyzedAt,
          updatedAt: new Date().toISOString(),
        }
      : token;

    this.db.tokens[token.mint] = merged;
    this.recomputeStatusCounters();
    this.schedulePersist();
    return merged;
  }

  public getToken(mint: string): TokenRecord | null {
    return this.db.tokens[mint] ?? null;
  }

  public getAllTokens(includeDemo = true): TokenRecord[] {
    const list = Object.values(this.db.tokens);
    const filtered = includeDemo ? list : list.filter((t) => !t.isDemo);
    return filtered.sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
    );
  }

  public clearDemoTokens(): void {
    for (const [mint, token] of Object.entries(this.db.tokens)) {
      if (token.isDemo) {
        delete this.db.tokens[mint];
        delete this.db.marketSnapshots[mint];
        delete this.db.walletAnalytics[mint];
        delete this.db.riskAssessments[mint];
      }
    }
    this.db.tokenEvents = this.db.tokenEvents.filter((e) => !e.isDemo);
    this.recomputeStatusCounters();
    this.schedulePersist();
  }

  public getEventsForMint(mint: string): TokenEvent[] {
    return this.db.tokenEvents.filter((e) => e.mint === mint);
  }

  public getRecentEvents(limit = 50): TokenEvent[] {
    return this.db.tokenEvents.slice(0, limit);
  }

  public addMarketSnapshot(snapshot: MarketSnapshot): void {
    const arr = this.db.marketSnapshots[snapshot.mint] ?? [];
    arr.unshift(snapshot);
    if (arr.length > 36) {
      arr.length = 36;
    }
    this.db.marketSnapshots[snapshot.mint] = arr;
    this.schedulePersist();
  }

  public getMarketSnapshots(mint: string): MarketSnapshot[] {
    return this.db.marketSnapshots[mint] ?? [];
  }

  public setWalletAnalytics(mint: string, analytics: WalletAnalytics): void {
    this.db.walletAnalytics[mint] = analytics;
    this.schedulePersist();
  }

  public getWalletAnalytics(mint: string): WalletAnalytics | null {
    return this.db.walletAnalytics[mint] ?? null;
  }

  public setRiskAssessment(mint: string, assessment: RiskAssessment): void {
    this.db.riskAssessments[mint] = assessment;
    this.schedulePersist();
  }

  public getRiskAssessment(mint: string): RiskAssessment | null {
    return this.db.riskAssessments[mint] ?? null;
  }

  public getWatchlist(workspaceId: string): WatchlistItem[] {
    return this.db.watchlists
      .filter((w) => w.workspaceId === workspaceId)
      .map((w) => ({
        ...w,
        token: this.db.tokens[w.mint] ?? null,
      }))
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
  }

  public isInWatchlist(workspaceId: string, mint: string): boolean {
    return this.db.watchlists.some((w) => w.workspaceId === workspaceId && w.mint === mint);
  }

  public upsertWatchlistItem(item: WatchlistItem): WatchlistItem {
    const idx = this.db.watchlists.findIndex(
      (w) => w.workspaceId === item.workspaceId && w.mint === item.mint
    );
    if (idx >= 0) {
      this.db.watchlists[idx] = { ...this.db.watchlists[idx], ...item };
    } else {
      this.db.watchlists.unshift(item);
    }
    this.schedulePersist();
    return { ...item, token: this.db.tokens[item.mint] ?? null };
  }

  public removeWatchlistItem(workspaceId: string, mint: string): boolean {
    const before = this.db.watchlists.length;
    this.db.watchlists = this.db.watchlists.filter(
      (w) => !(w.workspaceId === workspaceId && w.mint === mint)
    );
    const changed = this.db.watchlists.length !== before;
    if (changed) this.schedulePersist();
    return changed;
  }

  public getAllWatchlistMints(): Set<string> {
    return new Set(this.db.watchlists.map((w) => w.mint));
  }

  public addAlert(alert: AlertItem): AlertItem {
    this.db.alerts.unshift(alert);
    if (this.db.alerts.length > 500) {
      this.db.alerts.length = 500;
    }
    this.schedulePersist();
    return alert;
  }

  public getAlerts(workspaceId?: string): AlertItem[] {
    if (!workspaceId) return this.db.alerts;
    return this.db.alerts.filter(
      (a) => a.workspaceId === 'global' || a.workspaceId === workspaceId
    );
  }

  public markAlertRead(id: string): boolean {
    const found = this.db.alerts.find((a) => a.id === id);
    if (!found) return false;
    found.read = true;
    this.schedulePersist();
    return true;
  }

  public markAllAlertsRead(): void {
    for (const a of this.db.alerts) {
      a.read = true;
    }
    this.schedulePersist();
  }

  public addLog(
    source: CollectorLogEntry['source'],
    level: CollectorLogEntry['level'],
    message: string
  ): CollectorLogEntry {
    const entry: CollectorLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      source,
      level,
      message,
    };
    this.db.collectorLogs.unshift(entry);
    if (this.db.collectorLogs.length > 400) {
      this.db.collectorLogs.length = 400;
    }
    this.schedulePersist();
    return entry;
  }

  public getLogs(limit = 100): CollectorLogEntry[] {
    return this.db.collectorLogs.slice(0, limit);
  }

  public getMonitoredPrograms(): MonitoredProgram[] {
    return this.db.monitoredPrograms;
  }

  public addMonitoredProgram(prog: MonitoredProgram): MonitoredProgram {
    this.db.monitoredPrograms.push(prog);
    this.recomputeStatusCounters();
    this.schedulePersist();
    return prog;
  }

  public updateMonitoredProgram(
    id: string,
    patch: Partial<MonitoredProgram>
  ): MonitoredProgram | null {
    const found = this.db.monitoredPrograms.find((p) => p.id === id);
    if (!found) return null;
    Object.assign(found, patch);
    this.recomputeStatusCounters();
    this.schedulePersist();
    return found;
  }

  public deleteMonitoredProgram(id: string): boolean {
    const before = this.db.monitoredPrograms.length;
    this.db.monitoredPrograms = this.db.monitoredPrograms.filter((p) => p.id !== id);
    const changed = this.db.monitoredPrograms.length !== before;
    if (changed) {
      this.recomputeStatusCounters();
      this.schedulePersist();
    }
    return changed;
  }

  public getSettings(): PlatformSettings {
    return this.db.settings;
  }

  public updateSettings(patch: Partial<PlatformSettings>): PlatformSettings {
    this.db.settings = {
      ...this.db.settings,
      ...patch,
      alertRules: {
        ...this.db.settings.alertRules,
        ...(patch.alertRules ?? {}),
      },
      updatedAt: new Date().toISOString(),
    };
    this.recomputeStatusCounters();
    this.schedulePersist();
    return this.db.settings;
  }

  public getStorageStats(): {
    dataDir: string;
    totalPersistedTokens: number;
    totalPersistedEvents: number;
    latestPersistedEventAt: string | null;
  } {
    const realTokens = Object.values(this.db.tokens).filter((t) => !t.isDemo);
    const realEvents = this.db.tokenEvents.filter((e) => !e.isDemo);
    return {
      dataDir: DATA_DIR,
      totalPersistedTokens: realTokens.length,
      totalPersistedEvents: realEvents.length,
      latestPersistedEventAt: realEvents.length > 0 ? realEvents[0].detectedAt : null,
    };
  }

  public getCreateMintsTodayCount(startOfDayMs: number): number {
    const realTokens = Object.values(this.db.tokens).filter((t) => !t.isDemo);
    const createEventMintsToday = new Set(
      this.db.tokenEvents
        .filter(
          (e) =>
            !e.isDemo &&
            e.eventType === 'create' &&
            new Date(e.detectedAt).getTime() >= startOfDayMs
        )
        .map((e) => e.mint)
    );
    return realTokens.filter(
      (t) =>
        new Date(t.detectedAt).getTime() >= startOfDayMs &&
        (t.source === 'pumpportal-create' || createEventMintsToday.has(t.mint))
    ).length;
  }

  public recomputeStatusCounters(): void {
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).getTime();

    const realTokens = Object.values(this.db.tokens).filter((t) => !t.isDemo);
    const tokensToday = realTokens.filter(
      (t) => new Date(t.detectedAt).getTime() >= startOfDay
    );
    const newLaunchesTodayCount = this.getCreateMintsTodayCount(startOfDay);
    const migratedTotal = realTokens.filter((t) => t.migrated);
    const persistedPumpEvents = this.db.tokenEvents.filter(
      (e) =>
        !e.isDemo &&
        (e.source === 'pumpportal-create' || e.source === 'pumpportal-migration')
    ).length;

    const scope: string[] = [];
    if (this.collectorStatus.pumpportal.status === 'LIVE') {
      scope.push('PumpPortal WS (subscribeNewToken & subscribeMigration)');
    } else {
      scope.push(`PumpPortal WS (${this.collectorStatus.pumpportal.status})`);
    }
    scope.push('Helius WS (OPTIONAL / SKIPPED)');
    scope.push('DexScreener Public API (On-Demand & Cached)');
    scope.push('Solana Mainnet RPC (Deterministic Audits)');

    this.collectorStatus.pumpportal.persistedEventsCount = persistedPumpEvents;
    this.collectorStatus.totalDetectedTokens = realTokens.length;
    this.collectorStatus.tokensDetectedToday = tokensToday.length;
    this.collectorStatus.newLaunchesToday = newLaunchesTodayCount;
    this.collectorStatus.migratedTokensTotal = migratedTotal.length;
    this.collectorStatus.activeMonitoringScope = scope;
    this.collectorStatus.updatedAt = new Date().toISOString();
  }
}

export const store = new TerminalStore();
