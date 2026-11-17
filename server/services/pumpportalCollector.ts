import WebSocket from 'ws';
import type { TokenEvent, TokenRecord } from '../../src/types/domain.ts';
import { store } from '../storage/store.ts';
import { evaluateTokenAlertRules } from './alertService.ts';
import { eventBus } from './eventBus.ts';

const PUMPPORTAL_WS_URL = 'wss://pumpportal.fun/api/data';

interface PumpPortalRawPayload {
  signature?: string;
  mint?: string;
  traderPublicKey?: string;
  txType?: string;
  initialBuy?: number;
  solAmount?: number;
  bondingCurveKey?: string;
  vTokensInBondingCurve?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
  name?: string;
  symbol?: string;
  uri?: string;
  pool?: string;
  [key: string]: unknown;
}

function toOptionalNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

class PumpPortalCollector {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private backoffMs = 1500;
  private maxBackoffMs = 60_000;
  private isManuallyStopped = false;
  private isPongPending = false;

  public start(): void {
    this.isManuallyStopped = false;
    this.connect();
  }

  public reconnectNow(): void {
    this.isManuallyStopped = false;
    this.backoffMs = 1500;
    this.cleanupSocket();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connect();
  }

  public stop(): void {
    this.isManuallyStopped = true;
    this.cleanupSocket();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    store.collectorStatus.pumpportal.status = 'DISCONNECTED';
    store.recomputeStatusCounters();
    eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
  }

  private cleanupSocket(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.terminate();
        }
      } catch {
        // Ignore socket teardown errors
      }
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.isManuallyStopped) return;
    this.cleanupSocket();

    store.collectorStatus.pumpportal.status = 'CONNECTING';
    store.recomputeStatusCounters();
    eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
    store.addLog('pumpportal', 'info', `Connecting to ${PUMPPORTAL_WS_URL}`);

    const ws = new WebSocket(PUMPPORTAL_WS_URL, {
      handshakeTimeout: 10_000,
    });
    this.ws = ws;

    ws.on('open', () => {
      const now = new Date().toISOString();
      this.backoffMs = 1500;
      this.isPongPending = false;

      store.collectorStatus.pumpportal.status = 'LIVE';
      store.collectorStatus.pumpportal.lastConnectedAt = now;
      store.collectorStatus.pumpportal.lastHeartbeatAt = now;
      store.collectorStatus.pumpportal.lastError = null;
      store.recomputeStatusCounters();

      // Free documented subscriptions only; paid/metered methods are never auto-enabled.
      ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
      ws.send(JSON.stringify({ method: 'subscribeMigration' }));

      store.addLog(
        'pumpportal',
        'info',
        'Connected to PumpPortal WebSocket. Subscribed to subscribeNewToken & subscribeMigration.'
      );
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });

      this.heartbeatTimer = setInterval(() => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (this.isPongPending) {
          store.addLog('pumpportal', 'warn', 'PumpPortal WebSocket heartbeat timeout; reconnecting.');
          this.ws.terminate();
          return;
        }
        this.isPongPending = true;
        try {
          this.ws.ping();
          store.collectorStatus.pumpportal.lastHeartbeatAt = new Date().toISOString();
        } catch {
          this.ws.terminate();
        }
      }, 25_000);
    });

    ws.on('pong', () => {
      this.isPongPending = false;
      store.collectorStatus.pumpportal.lastHeartbeatAt = new Date().toISOString();
    });

    ws.on('message', (rawData) => {
      try {
        const text = rawData.toString('utf8');
        const parsed = JSON.parse(text) as PumpPortalRawPayload;
        void this.handleIncomingMessage(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Malformed JSON payload';
        store.addLog('pumpportal', 'warn', `Ignored unparseable WS message: ${msg}`);
      }
    });

    ws.on('error', (err) => {
      const msg = err instanceof Error ? err.message : 'WebSocket error';
      store.collectorStatus.pumpportal.status = 'ERROR';
      store.collectorStatus.pumpportal.lastError = msg;
      store.recomputeStatusCounters();
      store.addLog('pumpportal', 'error', `WebSocket error: ${msg}`);
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
    });

    ws.on('close', (code, reason) => {
      this.cleanupSocket();
      const reasonStr = reason?.toString('utf8') || `code ${code}`;
      if (this.isManuallyStopped) {
        store.collectorStatus.pumpportal.status = 'DISCONNECTED';
        store.recomputeStatusCounters();
        eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
        return;
      }

      store.collectorStatus.pumpportal.status = 'DISCONNECTED';
      store.collectorStatus.pumpportal.lastError = `Disconnected (${reasonStr})`;
      store.recomputeStatusCounters();
      store.addLog('pumpportal', 'warn', `Connection closed (${reasonStr}).`);
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });

      if (store.getSettings().pumpPortalAutoReconnect) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isManuallyStopped) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.maxBackoffMs, Math.round(this.backoffMs * 1.8));
    store.collectorStatus.pumpportal.reconnectCount += 1;
    store.addLog('pumpportal', 'info', `Scheduling reconnect in ${Math.round(delay / 1000)}s`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async handleIncomingMessage(payload: PumpPortalRawPayload): Promise<void> {
    if (!payload || typeof payload !== 'object') return;
    if (typeof payload.message === 'string' && !payload.mint) {
      store.addLog('pumpportal', 'info', `PumpPortal notice: ${payload.message}`);
      return;
    }

    const mint = typeof payload.mint === 'string' ? payload.mint.trim() : '';
    if (!mint) return;

    const now = new Date().toISOString();
    const signature =
      typeof payload.signature === 'string' && payload.signature.trim()
        ? payload.signature.trim()
        : `pp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (store.hasEvent(mint, signature)) {
      return;
    }

    const txType = typeof payload.txType === 'string' ? payload.txType.toLowerCase() : '';
    const isMigration =
      txType === 'migrate' ||
      txType === 'migration' ||
      Boolean(payload.pool && txType !== 'create');

    const event: TokenEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      mint,
      signature,
      eventType: isMigration ? 'migration' : 'create',
      source: isMigration ? 'pumpportal-migration' : 'pumpportal-create',
      detectedAt: now,
      creatorWallet:
        typeof payload.traderPublicKey === 'string' ? payload.traderPublicKey : null,
      rawPayload: payload as Record<string, unknown>,
      isDemo: false,
    };

    const inserted = store.addTokenEvent(event);
    if (!inserted) return;

    store.collectorStatus.pumpportal.status = 'LIVE';
    store.collectorStatus.pumpportal.lastEventAt = now;
    store.collectorStatus.pumpportal.lastSuccessAt = now;
    store.collectorStatus.pumpportal.eventsReceived += 1;
    store.collectorStatus.pumpportal.lastError = null;

    const existing = store.getToken(mint);
    const token: TokenRecord = store.upsertToken({
      mint,
      name:
        typeof payload.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : existing?.name || 'Unknown Token',
      symbol:
        typeof payload.symbol === 'string' && payload.symbol.trim()
          ? payload.symbol.trim()
          : existing?.symbol || 'UNKNOWN',
      creatorWallet:
        typeof payload.traderPublicKey === 'string'
          ? payload.traderPublicKey
          : existing?.creatorWallet ?? null,
      source: isMigration ? 'pumpportal-migration' : existing?.source ?? 'pumpportal-create',
      programId: isMigration
        ? '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg'
        : '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
      signature,
      detectedAt: existing?.detectedAt ?? now,
      migrated: existing?.migrated || isMigration,
      migratedAt: isMigration ? now : existing?.migratedAt ?? null,
      migrationPool:
        typeof payload.pool === 'string' ? payload.pool : existing?.migrationPool ?? null,
      initialBuySol: toOptionalNumber(payload.initialBuy ?? payload.solAmount) ?? existing?.initialBuySol ?? null,
      marketCapSol: toOptionalNumber(payload.marketCapSol) ?? existing?.marketCapSol ?? null,
      vSolInBondingCurve:
        toOptionalNumber(payload.vSolInBondingCurve) ?? existing?.vSolInBondingCurve ?? null,
      vTokensInBondingCurve:
        toOptionalNumber(payload.vTokensInBondingCurve) ?? existing?.vTokensInBondingCurve ?? null,
      metadataUri: typeof payload.uri === 'string' ? payload.uri : existing?.metadataUri ?? null,
      imageUrl: existing?.imageUrl ?? null,
      priceUsd: existing?.priceUsd ?? null,
      marketCapUsd: existing?.marketCapUsd ?? null,
      fdvUsd: existing?.fdvUsd ?? null,
      liquidityUsd: existing?.liquidityUsd ?? null,
      volume24hUsd: existing?.volume24hUsd ?? null,
      volume1hUsd: existing?.volume1hUsd ?? null,
      volume5mUsd: existing?.volume5mUsd ?? null,
      priceChange5m: existing?.priceChange5m ?? null,
      priceChange1h: existing?.priceChange1h ?? null,
      priceChange24h: existing?.priceChange24h ?? null,
      buys24h: existing?.buys24h ?? null,
      sells24h: existing?.sells24h ?? null,
      buys1h: existing?.buys1h ?? null,
      sells1h: existing?.sells1h ?? null,
      pairAddress: existing?.pairAddress ?? null,
      dexId: existing?.dexId ?? null,
      riskScore: existing?.riskScore ?? null,
      riskCategory: existing?.riskCategory ?? 'Unknown',
      verificationStage: existing?.verificationStage ?? 'Detected',
      isDemo: false,
      lastEnrichedAt: existing?.lastEnrichedAt ?? null,
      lastAnalyzedAt: existing?.lastAnalyzedAt ?? null,
      updatedAt: now,
    });

    eventBus.emitStream({ type: 'token:detected', token, event });
    eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
    await evaluateTokenAlertRules(token, {
      isNew: !existing && !isMigration,
      isMigration,
    });
  }
}

export const pumpportalCollector = new PumpPortalCollector();
