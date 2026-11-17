import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import type {
  CollectorLogEntry,
  CollectorStatusState,
  MonitoredProgram,
  PlatformSettings,
} from '../types/domain';
import { api, getAdminToken, setAdminToken } from '../lib/api';
import { formatTimeAgo, formatUtcTime } from '../lib/format';
import { CollectorStatusLabelText } from '../components/TokenStatusElements';

interface SettingsViewProps {
  onStatusUpdated: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onStatusUpdated }) => {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [capabilities, setCapabilities] = useState<{
    heliusKeyConfigured: boolean;
    pumpPortalKeyConfigured: boolean;
    telegramConfigured: boolean;
    geminiConfigured: boolean;
    adminSecretRequired: boolean;
  } | null>(null);
  const [status, setStatus] = useState<CollectorStatusState | null>(null);
  const [logs, setLogs] = useState<CollectorLogEntry[]>([]);
  const [programs, setPrograms] = useState<MonitoredProgram[]>([]);
  const [adminInput, setAdminInput] = useState(getAdminToken());
  const [newProgName, setNewProgName] = useState('');
  const [newProgId, setNewProgId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadAll = async () => {
    const [setRes, stRes, logRes, progRes] = await Promise.all([
      api.getSettings(),
      api.getCollectorStatus(),
      api.getCollectorLogs(60),
      api.getPrograms(),
    ]);
    setSettings(setRes.settings);
    setCapabilities(setRes.capabilities);
    setStatus(stRes);
    setLogs(logRes.logs);
    setPrograms(progRes.programs);
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const showNotice = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleReconnect = async () => {
    try {
      const res = await api.reconnectCollector();
      await loadAll();
      onStatusUpdated();
      showNotice(
        res.ok
          ? 'Triggered WebSocket collector reconnect.'
          : res.error ?? 'Collector reconnect unavailable in serverless mode.'
      );
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Reconnect failed.');
    }
  };

  const handleToggleHelius = async (enabled: boolean) => {
    try {
      const updated = await api.updateSettings({ heliusStreamEnabled: enabled });
      setSettings(updated);
      await loadAll();
      onStatusUpdated();
      showNotice(`Helius stream ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed updating Helius setting.');
    }
  };

  const handleToggleDemo = async (enabled: boolean) => {
    await api.toggleDemoMode(enabled);
    await loadAll();
    onStatusUpdated();
    showNotice(
      enabled
        ? 'Clearly marked DEMO records loaded alongside collector.'
        : 'Cleared DEMO records.'
    );
  };

  const handleAddProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.addProgram({
        name: newProgName.trim(),
        programId: newProgId.trim(),
        category: 'custom',
        activeSource: 'helius_ws',
      });
      setNewProgName('');
      setNewProgId('');
      await loadAll();
      showNotice('Added Solana program to monitor list.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed adding program.');
    }
  };

  const handleToggleProgram = async (prog: MonitoredProgram) => {
    try {
      await api.updateProgram(prog.id, { enabled: !prog.enabled });
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed updating program.');
    }
  };

  const handleDeleteProgram = async (id: string) => {
    try {
      await api.deleteProgram(id);
      await loadAll();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Failed deleting program.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#E4E7EC]">
            Collector & Platform Settings
          </h1>
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Configure Solana program monitoring, WebSocket worker controls, and inspect server-side environment status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleReconnect()}
          className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#E5C76B] text-[#060709] font-semibold text-xs rounded flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reconnect Collectors</span>
        </button>
      </div>

      {feedback && (
        <div className="terminal-panel rounded px-4 py-2.5 text-xs text-[#E5C76B]">
          {feedback}
        </div>
      )}

      {/* Collector Health Matrix */}
      {status && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {[status.pumpportal, status.helius, status.dexscreener, status.solanaRpc].map(
            (c) => (
              <div key={c.name} className="terminal-panel rounded p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#E4E7EC]">{c.label}</span>
                  <CollectorStatusLabelText status={c.status} />
                </div>
                <div className="font-mono-num text-[11px] text-[#646D7D] truncate">
                  {c.endpoint}
                </div>
                <div className="text-[11px] text-[#9AA3B2]">
                  Last Success: {formatTimeAgo(c.lastSuccessAt)} · Events:{' '}
                  <span className="font-mono-num">{c.eventsReceived}</span>
                </div>
                {c.lastError && (
                  <div className="text-[11px] text-amber-400 truncate" title={c.lastError}>
                    {c.lastError}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* Server Environment Secrets Status (Never exposes or accepts secret keys in UI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="terminal-panel rounded p-4 space-y-4 text-xs">
          <div>
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Server Secrets & Free-First Controls
            </h2>
            <p className="text-[#646D7D] mt-0.5">
              API secrets are managed strictly via server environment variables (Secrets panel), never in browser code.
            </p>
          </div>

          {capabilities && (
            <div className="divide-y divide-[#E4E7EC]/6 border border-[#E4E7EC]/8 rounded">
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[#9AA3B2]">PumpPortal Free WS (New Token & Migration)</span>
                <span className="font-mono-num text-emerald-400">ACTIVE (NO KEY NEEDED)</span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[#9AA3B2]">HELIUS_API_KEY (Optional RPC / Stream)</span>
                <span
                  className={`font-mono-num ${
                    capabilities.heliusKeyConfigured ? 'text-emerald-400' : 'text-[#646D7D]'
                  }`}
                >
                  {capabilities.heliusKeyConfigured ? 'CONFIGURED' : 'NOT SET'}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[#9AA3B2]">TELEGRAM_BOT_TOKEN & CHAT_ID</span>
                <span
                  className={`font-mono-num ${
                    capabilities.telegramConfigured ? 'text-emerald-400' : 'text-[#646D7D]'
                  }`}
                >
                  {capabilities.telegramConfigured ? 'CONFIGURED' : 'NOT SET'}
                </span>
              </div>
              <div className="px-3 py-2 flex items-center justify-between">
                <span className="text-[#9AA3B2]">GEMINI_API_KEY (On-Demand Briefs Only)</span>
                <span
                  className={`font-mono-num ${
                    capabilities.geminiConfigured ? 'text-emerald-400' : 'text-[#646D7D]'
                  }`}
                >
                  {capabilities.geminiConfigured ? 'CONFIGURED' : 'NOT SET'}
                </span>
              </div>
            </div>
          )}

          {settings && (
            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-[#E4E7EC] font-medium">
                    Enable Helius WebSocket Stream (Metered)
                  </div>
                  <div className="text-[11px] text-[#646D7D]">
                    Disabled by default to preserve free credits. Requires HELIUS_API_KEY.
                  </div>
                </div>
                <input
                  type="checkbox"
                  disabled={!capabilities?.heliusKeyConfigured}
                  checked={settings.heliusStreamEnabled}
                  onChange={(e) => void handleToggleHelius(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-[#E4E7EC] font-medium">
                    Show Clearly Marked DEMO Sample Tokens
                  </div>
                  <div className="text-[11px] text-[#646D7D]">
                    Useful only if live PumpPortal WS is blocked in your network sandbox.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.demoSampleEnabled}
                  onChange={(e) => void handleToggleDemo(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
              </label>

              {capabilities?.adminSecretRequired && (
                <div className="pt-2 border-t border-[#E4E7EC]/8 flex items-center gap-2">
                  <input
                    type="password"
                    value={adminInput}
                    onChange={(e) => setAdminInput(e.target.value)}
                    placeholder="Admin secret header token..."
                    className="flex-1 bg-[#13161C] border border-[#E4E7EC]/10 rounded px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAdminToken(adminInput);
                      showNotice('Saved admin session header.');
                    }}
                    className="px-3 py-1.5 bg-[#13161C] border border-[#D4AF37]/40 rounded text-xs text-[#E5C76B] cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Monitored Solana Program IDs */}
        <section className="terminal-panel rounded p-4 space-y-4 text-xs">
          <div>
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Configured Solana Program IDs
            </h2>
            <p className="text-[#646D7D] mt-0.5">
              Programs tracked by PumpPortal, optional Helius logsSubscribe, or Solana RPC inspection.
            </p>
          </div>

          <form onSubmit={handleAddProgram} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <input
              type="text"
              value={newProgName}
              onChange={(e) => setNewProgName(e.target.value)}
              placeholder="Program Name"
              className="sm:col-span-4 bg-[#13161C] border border-[#E4E7EC]/10 rounded px-2.5 py-1.5 text-xs text-[#E4E7EC]"
            />
            <input
              type="text"
              value={newProgId}
              onChange={(e) => setNewProgId(e.target.value)}
              placeholder="Solana Program ID (Base58)"
              className="sm:col-span-6 bg-[#13161C] border border-[#E4E7EC]/10 rounded px-2.5 py-1.5 text-xs font-mono-num text-[#E4E7EC]"
            />
            <button
              type="submit"
              className="sm:col-span-2 px-3 py-1.5 bg-[#D4AF37] text-[#060709] font-semibold rounded flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          <div className="divide-y divide-[#E4E7EC]/6 border border-[#E4E7EC]/8 rounded max-h-64 overflow-y-auto">
            {programs.map((p) => (
              <div key={p.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-[#E4E7EC] flex items-center gap-2">
                    <span>{p.name}</span>
                    <span className="font-mono-num text-[10px] text-[#D4AF37]">
                      {p.activeSource}
                    </span>
                  </div>
                  <div className="font-mono-num text-[11px] text-[#646D7D] truncate">
                    {p.programId}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => void handleToggleProgram(p)}
                    className="accent-[#D4AF37]"
                  />
                  {p.category === 'custom' && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteProgram(p.id)}
                      className="text-[#646D7D] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Collector Error & Event Logs */}
      <section className="terminal-panel rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E4E7EC]/8 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#E4E7EC]">
            Server Collector Diagnostics Log
          </h2>
          <button
            type="button"
            onClick={() => void loadAll()}
            className="text-xs text-[#D4AF37] hover:text-[#E5C76B] cursor-pointer"
          >
            Refresh Logs
          </button>
        </div>
        <div className="divide-y divide-[#E4E7EC]/6 max-h-64 overflow-y-auto font-mono-num text-[11px]">
          {logs.length === 0 ? (
            <div className="p-4 text-[#646D7D]">No collector logs recorded yet.</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="px-4 py-2 flex items-start gap-3">
                <span className="text-[#646D7D] shrink-0">
                  {formatUtcTime(l.timestamp).slice(11, 19)}
                </span>
                <span
                  className={`uppercase shrink-0 w-12 ${
                    l.level === 'error'
                      ? 'text-red-400'
                      : l.level === 'warn'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }`}
                >
                  {l.level}
                </span>
                <span className="text-[#E5C76B] shrink-0 w-24">{l.source}</span>
                <span className="text-[#9AA3B2] break-all">{l.message}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
