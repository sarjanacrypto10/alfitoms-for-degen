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
  private connectTimeoutTimer: NodeJS.Timeout | null = null;
  private subscriptionVerifyTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private backoffMs = 1500;
  private maxBackoffMs = 60_000;
  private isManuallyStopped = false;
  private isPongPending = false;
  private lastActivityMs = 0;

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
    store.collectorStatus.pumpportal.subscriptionsAcked = {
      newToken: false,
      migration: false,
    };
    store.recomputeStatusCounters();
    eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
  }

  private cleanupSocket(): void {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    if (this.subscriptionVerifyTimer) {
      clearTimeout(this.subscriptionVerifyTimer);
      this.subscriptionVerifyTimer = null;
    }
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

  private sendFreeSubscriptions(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    store.collectorStatus.pumpportal.subscribedMethods = [
      'subscribeNewToken',
      'subscribeMigration',
    ];
    store.collectorStatus.pumpportal.subscriptionsAcked = {
      newToken: false,
      migration: false,
    };
    try {
      // Free documented subscriptions only; paid/metered methods are never auto-enabled.
      ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
      ws.send(JSON.stringify({ method: 'subscribeMigration' }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Subscription send failed';
      store.collectorStatus.pumpportal.lastError = msg;
      store.addLog('pumpportal', 'error', `Failed sending subscriptions: ${msg}`);
    }
  }

  private markVerifiedLive(reason: string): void {
    if (this.subscriptionVerifyTimer) {
      clearTimeout(this.subscriptionVerifyTimer);
      this.subscriptionVerifyTimer = null;
    }
    const wasLive = store.collectorStatus.pumpportal.status === 'LIVE';
    store.collectorStatus.pumpportal.status = 'LIVE';
    store.collectorStatus.pumpportal.lastError = null;
    if (!wasLive) {
      store.recomputeStatusCounters();
      store.addLog('pumpportal', 'info', `PumpPortal stream verified LIVE (${reason}).`);
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
    }
  }

  private connect(): void {
    if (this.isManuallyStopped) return;
    this.cleanupSocket();

    store.collectorStatus.pumpportal.status = 'CONNECTING';
    store.collectorStatus.pumpportal.enabled = true;
    store.collectorStatus.pumpportal.subscriptionsAcked = {
      newToken: false,
      migration: false,
    };
    store.recomputeStatusCounters();
    eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
    store.addLog('pumpportal', 'info', `Connecting to ${PUMPPORTAL_WS_URL}`);

    const ws = new WebSocket(PUMPPORTAL_WS_URL, {
      handshakeTimeout: 12_000,
    });
    this.ws = ws;

    this.connectTimeoutTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        const timeoutMsg = 'PumpPortal WebSocket connection timed out after 15s.';
        store.collectorStatus.pumpportal.status = 'ERROR';
        store.collectorStatus.pumpportal.lastError = timeoutMsg;
        store.recomputeStatusCounters();
        store.addLog('pumpportal', 'error', timeoutMsg);
        eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
        try {
          ws.terminate();
        } catch {
          // Ignore terminate error
        }
      }
    }, 15_000);

    ws.on('open', () => {
      if (this.connectTimeoutTimer) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }

      const now = new Date().toISOString();
      this.backoffMs = 1500;
      this.isPongPending = false;
      this.lastActivityMs = Date.now();

      // Remain CONNECTING until PumpPortal confirms subscription or delivers a real WS frame/pong
      store.collectorStatus.pumpportal.lastConnectedAt = now;
      store.collectorStatus.pumpportal.lastHeartbeatAt = now;
      store.collectorStatus.pumpportal.lastError = null;

      this.sendFreeSubscriptions(ws);
      store.recomputeStatusCounters();

      store.addLog(
        'pumpportal',
        'info',
        'PumpPortal WS socket opened; sent subscribeNewToken & subscribeMigration, awaiting confirmation.'
      );
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });

      this.subscriptionVerifyTimer = setTimeout(() => {
        if (
          this.ws === ws &&
          ws.readyState === WebSocket.OPEN &&
          store.collectorStatus.pumpportal.status !== 'LIVE'
        ) {
          const verifyErr =
            'PumpPortal opened socket but did not confirm subscribeNewToken/subscribeMigration within 10s; reconnecting.';
          store.collectorStatus.pumpportal.status = 'ERROR';
          store.collectorStatus.pumpportal.lastError = verifyErr;
          store.addLog('pumpportal', 'warn', verifyErr);
          eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
          ws.terminate();
        }
      }, 10_000);

      this.heartbeatTimer = setInterval(() => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const idleMs = Date.now() - this.lastActivityMs;
        if (this.isPongPending && idleMs > 50_000) {
          store.addLog(
            'pumpportal',
            'warn',
            'PumpPortal WebSocket heartbeat & activity timeout; reconnecting.'
          );
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
      this.lastActivityMs = Date.now();
      store.collectorStatus.pumpportal.lastHeartbeatAt = new Date().toISOString();
    });

    ws.on('message', (rawData) => {
      this.lastActivityMs = Date.now();
      this.isPongPending = false;
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
      const preservedError = store.collectorStatus.pumpportal.lastError;
      this.cleanupSocket();
      const reasonStr = reason?.toString('utf8') || `code ${code}`;
      store.collectorStatus.pumpportal.subscriptionsAcked = {
        newToken: false,
        migration: false,
      };
      if (this.isManuallyStopped) {
        store.collectorStatus.pumpportal.status = 'DISCONNECTED';
        store.recomputeStatusCounters();
        eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
        return;
      }

      store.collectorStatus.pumpportal.status = 'DISCONNECTED';
      store.collectorStatus.pumpportal.lastError =
        preservedError &&
        (preservedError.includes('timed out') || preservedError.includes('did not confirm'))
          ? preservedError
          : `Disconnected (${reasonStr})`;
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
    const jitter = Math.round(this.backoffMs * (Math.random() * 0.2 - 0.1));
    const delay = Math.max(1000, this.backoffMs + jitter);
    this.backoffMs = Math.min(this.maxBackoffMs, Math.round(this.backoffMs * 1.8));
    store.collectorStatus.pumpportal.reconnectCount += 1;
    store.addLog('pumpportal', 'info', `Scheduling reconnect in ${(delay / 1000).toFixed(1)}s`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private async handleIncomingMessage(payload: PumpPortalRawPayload): Promise<void> {
    if (!payload || typeof payload !== 'object') return;

    if (typeof payload.errors === 'string' || typeof payload.error === 'string') {
      const errMsg = String(payload.errors ?? payload.error);
      store.collectorStatus.pumpportal.lastError = errMsg;
      store.addLog('pumpportal', 'error', `PumpPortal WS error notice: ${errMsg}`);
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
      return;
    }

    if (typeof payload.message === 'string' && !payload.mint) {
      const notice = payload.message;
      const lower = notice.toLowerCase();
      const acks = store.collectorStatus.pumpportal.subscriptionsAcked ?? {
        newToken: false,
        migration: false,
      };
      if (lower.includes('token creation')) {
        acks.newToken = true;
      }
      if (lower.includes('migration')) {
        acks.migration = true;
      }
      store.collectorStatus.pumpportal.subscriptionsAcked = acks;
      store.addLog('pumpportal', 'info', `PumpPortal notice: ${notice}`);
      if (acks.newToken || acks.migration) {
        this.markVerifiedLive(notice);
      } else {
        eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
      }
      return;
    }

    const mint = typeof payload.mint === 'string' ? payload.mint.trim() : '';
    if (!mint) return;
    this.markVerifiedLive(`event for ${mint.slice(0, 6)}`);

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
    try {
      await evaluateTokenAlertRules(token, {
        isNew: !existing && !isMigration,
        isMigration,
      });
    } catch (err) {
      store.addLog(
        'pumpportal',
        'warn',
        `Alert rule evaluation failed for ${mint}: ${err instanceof Error ? err.message : 'unknown error'}`
      );
    }
  }
}

export const pumpportalCollector = new PumpPortalCollector();
