import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, ExternalLink, Send } from 'lucide-react';
import type { AlertItem, AlertRulesConfig } from '../types/domain';
import { api } from '../lib/api';
import { formatTimeAgo } from '../lib/format';

interface AlertsViewProps {
  streamTick: number;
  onSelectToken: (mint: string) => void;
  onAlertsChanged: () => void;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  streamTick,
  onSelectToken,
  onAlertsChanged,
}) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [rules, setRules] = useState<AlertRulesConfig | null>(null);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAlerts = async () => {
    try {
      const res = await api.getAlerts();
      setAlerts(res.alerts);
      setRules(res.rules);
      setTelegramConfigured(res.telegramConfigured);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAlerts();
  }, [streamTick]);

  const handleMarkRead = async (id: string) => {
    await api.markAlertRead(id);
    await loadAlerts();
    onAlertsChanged();
  };

  const handleReadAll = async () => {
    await api.markAllAlertsRead();
    await loadAlerts();
    onAlertsChanged();
  };

  const handleSaveRules = async (patch: Partial<AlertRulesConfig>) => {
    const next = await api.updateAlertRules(patch);
    setRules(next);
    setStatusMsg('Alert rules updated.');
    setTimeout(() => setStatusMsg(null), 2500);
  };

  const handleTestTelegram = async () => {
    setStatusMsg(null);
    try {
      await api.testTelegram();
      setStatusMsg('Test Telegram alert dispatched successfully.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Telegram test failed.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#E4E7EC]">Alert Center</h1>
          <p className="text-xs text-[#9AA3B2] mt-0.5">
            Real-time notifications for migrations, high-risk detections, volume/liquidity thresholds, and watchlist activity.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleReadAll()}
          className="px-3 py-1.5 bg-[#13161C] border border-[#E4E7EC]/12 hover:border-[#D4AF37]/40 rounded text-xs text-[#E4E7EC] flex items-center gap-1.5 cursor-pointer"
        >
          <CheckCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>Mark All Read</span>
        </button>
      </div>

      {statusMsg && (
        <div className="terminal-panel rounded px-4 py-2.5 text-xs text-[#E5C76B]">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Alert Rules Panel */}
        <section className="terminal-panel rounded p-4 space-y-4">
          <h2 className="text-sm font-semibold text-[#E4E7EC]">Trigger Rules</h2>

          {rules && (
            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#9AA3B2]">Pump.fun Migration Alerts</span>
                <input
                  type="checkbox"
                  checked={rules.alertOnMigration}
                  onChange={(e) =>
                    void handleSaveRules({ alertOnMigration: e.target.checked })
                  }
                  className="accent-[#D4AF37]"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[#9AA3B2]">Every New Token Launch</span>
                <input
                  type="checkbox"
                  checked={rules.alertOnNewToken}
                  onChange={(e) =>
                    void handleSaveRules({ alertOnNewToken: e.target.checked })
                  }
                  className="accent-[#D4AF37]"
                />
              </label>

              <div>
                <div className="flex items-center justify-between text-[#9AA3B2] mb-1">
                  <span>High-Risk Score Threshold</span>
                  <span className="font-mono-num text-[#E5C76B]">
                    &ge; {rules.alertOnHighRiskScore}
                  </span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={95}
                  step={5}
                  value={rules.alertOnHighRiskScore}
                  onChange={(e) =>
                    void handleSaveRules({ alertOnHighRiskScore: Number(e.target.value) })
                  }
                  className="w-full accent-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-[#9AA3B2] mb-1">
                  24h Volume Threshold (USD)
                </label>
                <input
                  type="number"
                  value={rules.alertOnVolumeUsd}
                  onChange={(e) =>
                    void handleSaveRules({
                      alertOnVolumeUsd: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="w-full bg-[#13161C] border border-[#E4E7EC]/10 rounded px-2.5 py-1.5 font-mono-num text-xs text-[#E4E7EC]"
                />
              </div>

              <div className="pt-3 border-t border-[#E4E7EC]/8 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#E4E7EC] font-medium">
                    Server-Side Telegram Bot
                  </span>
                  <span
                    className={`font-mono-num text-[11px] ${
                      telegramConfigured ? 'text-emerald-400' : 'text-[#646D7D]'
                    }`}
                  >
                    {telegramConfigured ? 'CONFIGURED' : 'NO ENV SECRETS'}
                  </span>
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-[#9AA3B2]">Dispatch Alerts to Telegram</span>
                  <input
                    type="checkbox"
                    disabled={!telegramConfigured}
                    checked={rules.telegramEnabled && telegramConfigured}
                    onChange={(e) =>
                      void handleSaveRules({ telegramEnabled: e.target.checked })
                    }
                    className="accent-[#D4AF37]"
                  />
                </label>

                <button
                  type="button"
                  disabled={!telegramConfigured}
                  onClick={() => void handleTestTelegram()}
                  className="w-full px-3 py-1.5 bg-[#13161C] border border-[#E4E7EC]/12 hover:border-[#D4AF37]/40 rounded text-xs text-[#E4E7EC] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-3 h-3 text-[#D4AF37]" />
                  <span>Send Test Telegram Message</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Alert Feed */}
        <section className="lg:col-span-2 terminal-panel rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E4E7EC]/8">
            <h2 className="text-sm font-semibold text-[#E4E7EC]">
              Alert Feed ({alerts.length})
            </h2>
          </div>

          {loading && alerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#646D7D]">Loading alerts...</div>
          ) : alerts.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#9AA3B2] space-y-2">
              <Bell className="w-5 h-5 text-[#646D7D] mx-auto" />
              <p>No alerts triggered yet. Enable migration or new-token triggers to receive live notifications.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E4E7EC]/6">
              {alerts.map((al) => (
                <div
                  key={al.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    al.read ? 'opacity-65' : 'bg-[#13161C]/40'
                  }`}
                >
                  <div
                    onClick={() => onSelectToken(al.mint)}
                    className="space-y-1 cursor-pointer min-w-0"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          al.severity === 'critical'
                            ? 'text-red-400'
                            : al.severity === 'warning'
                              ? 'text-amber-400'
                              : 'text-[#E5C76B]'
                        }`}
                      >
                        {al.title}
                      </span>
                      <span className="font-mono-num text-[11px] text-[#646D7D]">
                        · {formatTimeAgo(al.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[#9AA3B2]">{al.message}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    {al.evidenceUrl && (
                      <a
                        href={al.evidenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#9AA3B2] hover:text-[#E5C76B] flex items-center gap-1"
                      >
                        <span>Solscan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {!al.read && (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(al.id)}
                        className="px-2.5 py-1 bg-[#13161C] border border-[#E4E7EC]/12 rounded text-[11px] text-[#E4E7EC] cursor-pointer"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
