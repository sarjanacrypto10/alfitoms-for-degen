import type {
  AlertItem,
  AlertRulesConfig,
  CollectorLogEntry,
  CollectorStatusState,
  MonitoredProgram,
  OverviewResponse,
  PlatformSettings,
  RiskAssessment,
  TokenDetailResponse,
  TokenRecord,
  WalletAnalytics,
  WalletTxSummary,
  WatchlistItem,
} from '../types/domain';

const WORKSPACE_STORAGE_KEY = 'alfitoms_workspace_id';
const ADMIN_TOKEN_STORAGE_KEY = 'alfitoms_admin_token';

export function getWorkspaceId(): string {
  if (typeof window === 'undefined') return 'default-operator';
  let existing = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!existing) {
    existing = `ws_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, existing);
  }
  return existing;
}

export function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '';
}

export function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  if (token.trim()) {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
  } else {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('x-workspace-id', getWorkspaceId());
  const adminToken = getAdminToken();
  if (adminToken) {
    headers.set('x-admin-token', adminToken);
  }
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, {
    ...init,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`
    );
  }
  return data as T;
}

export const api = {
  getOverview: () => apiFetch<OverviewResponse>('/api/overview'),

  getTokens: (params: {
    q?: string;
    source?: string;
    risk?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.source) qs.set('source', params.source);
    if (params.risk) qs.set('risk', params.risk);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortDir) qs.set('sortDir', params.sortDir);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return apiFetch<{
      items: TokenRecord[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/api/tokens?${qs.toString()}`);
  },

  getTokenDetail: (mint: string) =>
    apiFetch<TokenDetailResponse>(`/api/tokens/${encodeURIComponent(mint)}`),

  inspectMint: (mint: string) =>
    apiFetch<{
      token: TokenRecord;
      walletAnalytics: WalletAnalytics;
      riskAssessment: RiskAssessment;
    }>('/api/tokens/inspect', {
      method: 'POST',
      body: JSON.stringify({ mint }),
    }),

  enrichToken: (mint: string) =>
    apiFetch<{ token: TokenRecord | null }>(`/api/tokens/${encodeURIComponent(mint)}/enrich`, {
      method: 'POST',
    }),

  analyzeToken: (mint: string) =>
    apiFetch<{
      token: TokenRecord;
      walletAnalytics: WalletAnalytics;
      riskAssessment: RiskAssessment;
    }>(`/api/tokens/${encodeURIComponent(mint)}/analyze`, {
      method: 'POST',
    }),

  generateAiBrief: (mint: string) =>
    apiFetch<RiskAssessment>(`/api/tokens/${encodeURIComponent(mint)}/ai-brief`, {
      method: 'POST',
    }),

  getTrending: (refresh = false) =>
    apiFetch<{
      dexScreenerTrending: TokenRecord[];
      fetchedAt: string | null;
      error: string | null;
      byVolume: TokenRecord[];
      byLiquidity: TokenRecord[];
      byPriceMove: TokenRecord[];
      newestLaunches: TokenRecord[];
    }>(`/api/trending${refresh ? '?refresh=true' : ''}`),

  getAnalytics: (range: '1h' | '6h' | '24h') =>
    apiFetch<{
      range: string;
      summary: {
        trackedTokens: number;
        enrichedTokens: number;
        totalVolume24h: number;
        totalVolume1h: number;
        totalVolume5m: number;
        totalLiquidity: number;
        buys24h: number;
        sells24h: number;
        buys1h: number;
        sells1h: number;
      };
      activitySeries: Array<{
        label: string;
        launches: number;
        migrations: number;
        volumeUsd: number;
      }>;
      unusualVolume: Array<{ token: TokenRecord; volToLiqRatio: number }>;
      topByLiquidity: TokenRecord[];
    }>(`/api/analytics?range=${range}`),

  inspectWallet: (address: string) =>
    apiFetch<{
      address: string;
      valid: boolean;
      balanceSol: number | null;
      recentTxs: WalletTxSummary[];
      fundingSources: Array<{
        funder: string;
        solAmount: number;
        signature: string;
        blockTime: string | null;
      }>;
      createdTokens: TokenRecord[];
      error: string | null;
    }>(`/api/wallets/${encodeURIComponent(address)}`),

  getWatchlist: () => apiFetch<{ items: WatchlistItem[] }>('/api/watchlist'),

  addToWatchlist: (payload: {
    mint: string;
    symbol?: string;
    name?: string;
    notes?: string;
  }) =>
    apiFetch<WatchlistItem>('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  removeFromWatchlist: (mint: string) =>
    apiFetch<{ removed: boolean }>(`/api/watchlist/${encodeURIComponent(mint)}`, {
      method: 'DELETE',
    }),

  getAlerts: () =>
    apiFetch<{
      alerts: AlertItem[];
      rules: AlertRulesConfig;
      telegramConfigured: boolean;
    }>('/api/alerts'),

  markAlertRead: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/alerts/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }),

  markAllAlertsRead: () =>
    apiFetch<{ ok: boolean }>('/api/alerts/read-all', { method: 'POST' }),

  updateAlertRules: (rules: Partial<AlertRulesConfig>) =>
    apiFetch<AlertRulesConfig>('/api/alerts/rules', {
      method: 'POST',
      body: JSON.stringify(rules),
    }),

  testTelegram: () =>
    apiFetch<{ ok: boolean; error?: string }>('/api/alerts/test-telegram', {
      method: 'POST',
    }),

  getCollectorStatus: () => apiFetch<CollectorStatusState>('/api/collector/status'),

  getCollectorLogs: (limit = 80) =>
    apiFetch<{ logs: CollectorLogEntry[] }>(`/api/collector/logs?limit=${limit}`),

  reconnectCollector: () =>
    apiFetch<{ ok: boolean; status: CollectorStatusState }>('/api/collector/reconnect', {
      method: 'POST',
    }),

  toggleDemoMode: (enabled: boolean) =>
    apiFetch<{ ok: boolean; demoSampleEnabled: boolean }>('/api/collector/demo', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  getPrograms: () => apiFetch<{ programs: MonitoredProgram[] }>('/api/programs'),

  addProgram: (payload: {
    name: string;
    programId: string;
    category: MonitoredProgram['category'];
    activeSource: MonitoredProgram['activeSource'];
    notes?: string;
  }) =>
    apiFetch<MonitoredProgram>('/api/programs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProgram: (id: string, patch: { enabled?: boolean; notes?: string }) =>
    apiFetch<MonitoredProgram>(`/api/programs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteProgram: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/api/programs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getSettings: () =>
    apiFetch<{
      settings: PlatformSettings;
      capabilities: {
        heliusKeyConfigured: boolean;
        pumpPortalKeyConfigured: boolean;
        telegramConfigured: boolean;
        geminiConfigured: boolean;
        adminSecretRequired: boolean;
      };
    }>('/api/settings'),

  updateSettings: (patch: Partial<PlatformSettings>) =>
    apiFetch<PlatformSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};
