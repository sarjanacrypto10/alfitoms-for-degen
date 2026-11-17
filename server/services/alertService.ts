import type { AlertItem, AlertType, RiskAssessment, TokenRecord } from '../../src/types/domain.ts';
import { store } from '../storage/store.ts';
import { eventBus } from './eventBus.ts';

async function sendTelegramNotification(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured.' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const msg = `Telegram API HTTP ${res.status}: ${errBody.slice(0, 140)}`;
      store.collectorStatus.telegram.status = 'ERROR';
      store.collectorStatus.telegram.lastError = msg;
      store.addLog('telegram', 'error', msg);
      return { ok: false, error: msg };
    }

    store.collectorStatus.telegram.status = 'LIVE';
    store.collectorStatus.telegram.lastSuccessAt = new Date().toISOString();
    store.collectorStatus.telegram.lastError = null;
    store.collectorStatus.telegram.eventsReceived += 1;
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Telegram request failed';
    store.collectorStatus.telegram.status = 'ERROR';
    store.collectorStatus.telegram.lastError = msg;
    store.addLog('telegram', 'error', msg);
    return { ok: false, error: msg };
  }
}

export async function dispatchAlert(params: {
  workspaceId?: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  mint: string;
  symbol: string;
  title: string;
  message: string;
  evidenceUrl?: string | null;
}): Promise<AlertItem> {
  const settings = store.getSettings();
  const hasTelegramCreds = Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_CHAT_ID?.trim()
  );

  let telegramSent = false;
  if (settings.alertRules.telegramEnabled && hasTelegramCreds) {
    const tgRes = await sendTelegramNotification(
      `<b>[ALFITOMS FOR DEGEN] ${params.title}</b>\nToken: ${params.symbol} (<code>${params.mint}</code>)\nSeverity: ${params.severity.toUpperCase()}\n${params.message}${
        params.evidenceUrl ? `\nEvidence: ${params.evidenceUrl}` : ''
      }`
    );
    telegramSent = tgRes.ok;
  }

  const alert: AlertItem = {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    workspaceId: params.workspaceId ?? 'global',
    type: params.type,
    severity: params.severity,
    mint: params.mint,
    symbol: params.symbol,
    title: params.title,
    message: params.message,
    createdAt: new Date().toISOString(),
    read: false,
    telegramSent,
    evidenceUrl: params.evidenceUrl ?? `https://solscan.io/token/${params.mint}`,
  };

  store.addAlert(alert);
  eventBus.emitStream({ type: 'alert:new', alert });
  return alert;
}

export async function evaluateTokenAlertRules(
  token: TokenRecord,
  context: { isNew?: boolean; isMigration?: boolean; risk?: RiskAssessment | null }
): Promise<void> {
  if (token.isDemo) return;
  const rules = store.getSettings().alertRules;
  const watchlistedMints = store.getAllWatchlistMints();
  const isWatchlisted = watchlistedMints.has(token.mint);

  if (context.isMigration && rules.alertOnMigration) {
    await dispatchAlert({
      type: 'migration',
      severity: 'info',
      mint: token.mint,
      symbol: token.symbol,
      title: `Pump.fun Migration Detected: ${token.symbol}`,
      message: `${token.name} (${token.symbol}) migrated to ${token.migrationPool ?? 'AMM pool'}.`,
      evidenceUrl: token.signature
        ? `https://solscan.io/tx/${token.signature}`
        : `https://solscan.io/token/${token.mint}`,
    });
  } else if (context.isNew && rules.alertOnNewToken) {
    await dispatchAlert({
      type: 'new_token',
      severity: 'info',
      mint: token.mint,
      symbol: token.symbol,
      title: `New Token Launched: ${token.symbol}`,
      message: `${token.name} detected from ${token.source}. Creator: ${
        token.creatorWallet ?? 'Unavailable'
      }.`,
    });
  }

  if (
    token.volume24hUsd !== null &&
    token.volume24hUsd >= rules.alertOnVolumeUsd &&
    rules.alertOnVolumeUsd > 0
  ) {
    // Avoid duplicate volume alerts within 15 minutes for the same mint
    const recentSame = store
      .getAlerts()
      .find(
        (a) =>
          a.mint === token.mint &&
          a.type === 'volume_threshold' &&
          Date.now() - new Date(a.createdAt).getTime() < 15 * 60 * 1000
      );
    if (!recentSame) {
      await dispatchAlert({
        type: 'volume_threshold',
        severity: 'info',
        mint: token.mint,
        symbol: token.symbol,
        title: `Volume Threshold Crossed: ${token.symbol}`,
        message: `24h volume reached $${Math.round(token.volume24hUsd).toLocaleString('en-US')} (threshold $${rules.alertOnVolumeUsd.toLocaleString('en-US')}).`,
      });
    }
  }

  if (
    token.liquidityUsd !== null &&
    token.liquidityUsd >= rules.alertOnLiquidityUsd &&
    isWatchlisted
  ) {
    const recentSame = store
      .getAlerts()
      .find(
        (a) =>
          a.mint === token.mint &&
          a.type === 'watchlist_activity' &&
          Date.now() - new Date(a.createdAt).getTime() < 15 * 60 * 1000
      );
    if (!recentSame) {
      await dispatchAlert({
        type: 'watchlist_activity',
        severity: 'info',
        mint: token.mint,
        symbol: token.symbol,
        title: `Watchlist Liquidity Update: ${token.symbol}`,
        message: `Watchlisted token liquidity is $${Math.round(token.liquidityUsd).toLocaleString('en-US')}.`,
      });
    }
  }

  if (
    context.risk &&
    context.risk.score !== null &&
    context.risk.score >= rules.alertOnHighRiskScore
  ) {
    const recentRisk = store
      .getAlerts()
      .find(
        (a) =>
          a.mint === token.mint &&
          a.type === 'high_risk' &&
          Date.now() - new Date(a.createdAt).getTime() < 15 * 60 * 1000
      );
    if (!recentRisk) {
      await dispatchAlert({
        type: 'high_risk',
        severity: context.risk.score >= 80 ? 'critical' : 'warning',
        mint: token.mint,
        symbol: token.symbol,
        title: `High-Risk Flag (${context.risk.category}): ${token.symbol}`,
        message: `Deterministic on-chain scan scored ${context.risk.score}/100 (${context.risk.category}). Review authority & concentration findings.`,
      });
    }
  }
}

export async function sendTestTelegramAlert(): Promise<{ ok: boolean; error?: string }> {
  return sendTelegramNotification(
    `<b>[ALFITOMS FOR DEGEN]</b>\nServer-side Telegram notification test successful.\nNetwork: Solana Mainnet-Beta`
  );
}
