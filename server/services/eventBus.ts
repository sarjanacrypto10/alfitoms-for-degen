import { EventEmitter } from 'events';
import type {
  AlertItem,
  CollectorStatusState,
  TokenEvent,
  TokenRecord,
} from '../../src/types/domain.ts';

export type StreamPayload =
  | { type: 'snapshot'; status: CollectorStatusState }
  | { type: 'token:detected'; token: TokenRecord; event: TokenEvent }
  | { type: 'token:updated'; token: TokenRecord }
  | { type: 'alert:new'; alert: AlertItem }
  | { type: 'collector:status'; status: CollectorStatusState };

class TerminalEventBus extends EventEmitter {
  emitStream(payload: StreamPayload): void {
    this.emit('stream', payload);
  }
}

export const eventBus = new TerminalEventBus();
eventBus.setMaxListeners(100);
