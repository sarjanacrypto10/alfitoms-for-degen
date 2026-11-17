import WebSocket from 'ws';
import type { TokenEvent } from '../../src/types/domain.ts';
import { store } from '../storage/store.ts';
import { eventBus } from './eventBus.ts';

class HeliusCollector {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private backoffMs = 3000;

  public syncWithSettings(): void {
    const apiKey = process.env.HELIUS_API_KEY?.trim();
    const enabled = store.getSettings().heliusStreamEnabled;

    store.collectorStatus.helius.hasKeyConfigured = Boolean(apiKey);
    store.collectorStatus.helius.enabled = Boolean(apiKey && enabled);

    if (!apiKey) {
      this.stop('HELIUS_API_KEY not configured (optional paid/metered service).');
      return;
    }
    if (!enabled) {
      this.stop('Helius WebSocket stream disabled in Settings (free-first default).');
      return;
    }

    this.connect(apiKey);
  }

  public stop(reason = 'Helius stream disabled.'): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch {
        // Ignore cleanup errors
      }
      this.ws = null;
    }
    store.collectorStatus.helius.status = 'DISCONNECTED';
    store.collectorStatus.helius.lastError = reason;
    store.recomputeStatusCounters();
    eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
  }

  private connect(apiKey: string): void {
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    const heliusPrograms = store
      .getMonitoredPrograms()
      .filter((p) => p.enabled && p.activeSource === 'helius_ws');

    if (heliusPrograms.length === 0) {
      this.stop('No programs enabled for Helius WebSocket monitoring.');
      return;
    }

    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    store.collectorStatus.helius.status = 'CONNECTING';
    store.collectorStatus.helius.lastError = null;
    store.recomputeStatusCounters();
    eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });

    const ws = new WebSocket(wsUrl, { handshakeTimeout: 10_000 });
    this.ws = ws;

    ws.on('open', () => {
      const now = new Date().toISOString();
      this.backoffMs = 3000;
      store.collectorStatus.helius.status = 'LIVE';
      store.collectorStatus.helius.lastConnectedAt = now;
      store.collectorStatus.helius.lastHeartbeatAt = now;
      store.collectorStatus.helius.lastError = null;
      store.recomputeStatusCounters();

      heliusPrograms.forEach((prog, idx) => {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: idx + 1,
            method: 'logsSubscribe',
            params: [{ mentions: [prog.programId] }, { commitment: 'confirmed' }],
          })
        );
      });

      store.addLog(
        'helius',
        'info',
        `Connected Helius WS; subscribed to ${heliusPrograms.length} program(s).`
      );
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });

      this.heartbeatTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
          store.collectorStatus.helius.lastHeartbeatAt = new Date().toISOString();
        }
      }, 30_000);
    });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString('utf8')) as {
          method?: string;
          params?: {
            result?: {
              value?: {
                signature?: string;
                err?: unknown;
                logs?: string[];
              };
            };
          };
        };

        if (parsed.method === 'logsNotification' && parsed.params?.result?.value) {
          const val = parsed.params.result.value;
          const now = new Date().toISOString();
          store.collectorStatus.helius.lastEventAt = now;
          store.collectorStatus.helius.lastSuccessAt = now;
          store.collectorStatus.helius.eventsReceived += 1;

          const sig = val.signature;
          const logs = Array.isArray(val.logs) ? val.logs : [];
          const isInit = logs.some(
            (l) =>
              l.includes('InitializeMint') ||
              l.includes('initialize2') ||
              l.includes('Instruction: Create')
          );
          if (sig && isInit) {
            const event: TokenEvent = {
              id: `hevt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              mint: 'PendingMintParse',
              signature: sig,
              eventType: 'program_log',
              source: 'helius-stream',
              detectedAt: now,
              creatorWallet: null,
              rawPayload: { signature: sig, logs: logs.slice(0, 16) },
              isDemo: false,
            };
            store.addTokenEvent(event);
          }
        }
      } catch {
        // Ignore unparseable frames
      }
    });

    ws.on('error', (err) => {
      const msg = err instanceof Error ? err.message : 'Helius WS error';
      store.collectorStatus.helius.status = 'ERROR';
      store.collectorStatus.helius.lastError = msg;
      store.recomputeStatusCounters();
      store.addLog('helius', 'error', msg);
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });
    });

    ws.on('close', () => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.ws = null;
      const stillEnabled =
        Boolean(process.env.HELIUS_API_KEY?.trim()) && store.getSettings().heliusStreamEnabled;
      store.collectorStatus.helius.status = 'DISCONNECTED';
      store.recomputeStatusCounters();
      eventBus.emitStream({ type: 'collector:status', status: store.collectorStatus });

      if (stillEnabled && !this.reconnectTimer) {
        const delay = this.backoffMs;
        this.backoffMs = Math.min(60_000, Math.round(this.backoffMs * 1.8));
        store.collectorStatus.helius.reconnectCount += 1;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.syncWithSettings();
        }, delay);
      }
    });
  }
}

export const heliusCollector = new HeliusCollector();
