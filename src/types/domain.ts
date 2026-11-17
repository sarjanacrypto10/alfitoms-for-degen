export type CollectorStatusLabel =
  | 'LIVE'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'DEMO'
  | 'ERROR';

export type VerificationStage =
  | 'Detected'
  | 'Enriched'
  | 'Analyzed'
  | 'Verified'
  | 'Unverified';

export type RiskCategory = 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown';

export type LaunchSource =
  | 'pumpportal-create'
  | 'pumpportal-migration'
  | 'helius-stream'
  | 'manual-inspect'
  | 'demo-sample';

export interface TokenRecord {
  mint: string;
  name: string;
  symbol: string;
  creatorWallet: string | null;
  source: LaunchSource;
  programId: string | null;
  signature: string | null;
  detectedAt: string;
  migrated: boolean;
  migratedAt: string | null;
  migrationPool: string | null;
  initialBuySol: number | null;
  marketCapSol: number | null;
  vSolInBondingCurve: number | null;
  vTokensInBondingCurve: number | null;
  metadataUri: string | null;
  imageUrl: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  volume1hUsd: number | null;
  volume5mUsd: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  buys1h: number | null;
  sells1h: number | null;
  pairAddress: string | null;
  dexId: string | null;
  riskScore: number | null;
  riskCategory: RiskCategory;
  verificationStage: VerificationStage;
  isDemo: boolean;
  lastEnrichedAt: string | null;
  lastAnalyzedAt: string | null;
  updatedAt: string;
}

export interface TokenEvent {
  id: string;
  mint: string;
  signature: string;
  eventType: 'create' | 'migration' | 'program_log' | 'manual_inspect' | 'demo';
  source: LaunchSource;
  detectedAt: string;
  creatorWallet: string | null;
  rawPayload: Record<string, unknown>;
  isDemo: boolean;
}

export interface MarketSnapshot {
  id: string;
  mint: string;
  provider: 'dexscreener';
  fetchedAt: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  volume1hUsd: number | null;
  volume6hUsd: number | null;
  volume24hUsd: number | null;
  priceChange5m: number | null;
  priceChange1h: number | null;
  priceChange6h: number | null;
  priceChange24h: number | null;
  buys5m: number | null;
  sells5m: number | null;
  buys1h: number | null;
  sells1h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  pairAddress: string | null;
  dexId: string | null;
  pairUrl: string | null;
  baseSymbol: string | null;
  quoteSymbol: string | null;
  errorMessage: string | null;
}

export interface HolderEntry {
  tokenAccount: string;
  owner: string | null;
  amountUi: number;
  percentageOfSupply: number | null;
  rank: number;
}

export interface WalletTxSummary {
  signature: string;
  slot: number;
  blockTime: string | null;
  err: boolean;
  memo: string | null;
  feeLamports: number | null;
  typeHint: string;
}

export interface WalletClusterSignal {
  type: 'same_slot_bundle' | 'shared_funder' | 'high_creator_activity' | 'early_buyer';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  evidence: string;
  slot?: number;
  addresses: string[];
  signatures: string[];
}

export interface WalletAnalytics {
  mint: string;
  analyzedAt: string;
  rpcEndpointLabel: string;
  tokenProgram: 'SPL Token' | 'Token-2022' | 'Unknown';
  tokenProgramId: string | null;
  supplyUi: number | null;
  decimals: number | null;
  creatorWallet: string | null;
  creatorBalanceSol: number | null;
  creatorFundingSources: Array<{
    funder: string;
    lamports: number | null;
    signature: string;
    blockTime: string | null;
  }>;
  topHolders: HolderEntry[];
  top1Pct: number | null;
  top5Pct: number | null;
  top10Pct: number | null;
  recentMintTxs: WalletTxSummary[];
  recentCreatorTxs: WalletTxSummary[];
  clusterSignals: WalletClusterSignal[];
  observationNotes: string[];
  errorMessage: string | null;
}

export interface RiskFinding {
  id: string;
  category:
    | 'mint_authority'
    | 'freeze_authority'
    | 'token_2022_extension'
    | 'mutable_metadata'
    | 'liquidity_depth'
    | 'lp_lock_burn'
    | 'holder_concentration'
    | 'bundled_activity'
    | 'creator_activity';
  label: string;
  status: 'pass' | 'warning' | 'critical' | 'unknown';
  scoreImpact: number;
  detail: string;
  evidenceUrl: string | null;
}

export interface RiskAssessment {
  mint: string;
  analyzedAt: string;
  score: number | null;
  category: RiskCategory;
  mintAuthorityStatus: 'revoked' | 'active' | 'unknown';
  mintAuthorityAddress: string | null;
  freezeAuthorityStatus: 'revoked' | 'active' | 'unknown';
  freezeAuthorityAddress: string | null;
  metadataMutable: 'mutable' | 'immutable' | 'unknown';
  token2022Extensions: string[];
  lpStatus: 'unverified' | 'burned_verified' | 'locked_verified';
  lpEvidenceNote: string;
  findings: RiskFinding[];
  disclaimer: string;
  aiSummary: string | null;
  aiGeneratedAt: string | null;
}

export interface WatchlistItem {
  id: string;
  workspaceId: string;
  mint: string;
  symbol: string;
  name: string;
  addedAt: string;
  notes: string;
  token?: TokenRecord | null;
}

export type AlertType =
  | 'new_token'
  | 'migration'
  | 'liquidity_change'
  | 'volume_threshold'
  | 'large_tx'
  | 'high_risk'
  | 'watchlist_activity';

export interface AlertItem {
  id: string;
  workspaceId: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  mint: string;
  symbol: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  telegramSent: boolean;
  evidenceUrl: string | null;
}

export interface CollectorHealth {
  name: 'pumpportal' | 'helius' | 'dexscreener' | 'solana_rpc' | 'telegram';
  label: string;
  status: CollectorStatusLabel;
  enabled: boolean;
  requiresKey: boolean;
  hasKeyConfigured: boolean;
  endpoint: string;
  lastConnectedAt: string | null;
  lastHeartbeatAt: string | null;
  lastEventAt: string | null;
  lastSuccessAt: string | null;
  reconnectCount: number;
  eventsReceived: number;
  lastError: string | null;
}

export interface CollectorStatusState {
  pumpportal: CollectorHealth;
  helius: CollectorHealth;
  dexscreener: CollectorHealth;
  solanaRpc: CollectorHealth;
  telegram: CollectorHealth;
  totalDetectedTokens: number;
  tokensDetectedToday: number;
  newLaunchesToday: number;
  migratedTokensTotal: number;
  activeMonitoringScope: string[];
  updatedAt: string;
}

export interface CollectorLogEntry {
  id: string;
  timestamp: string;
  source: 'pumpportal' | 'helius' | 'dexscreener' | 'solana_rpc' | 'telegram' | 'system';
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface MonitoredProgram {
  id: string;
  name: string;
  programId: string;
  category: 'launchpad' | 'amm' | 'token_program' | 'custom';
  enabled: boolean;
  activeSource: 'pumpportal_ws' | 'helius_ws' | 'rpc_inspection_only';
  notes: string;
  createdAt: string;
}

export interface AlertRulesConfig {
  alertOnMigration: boolean;
  alertOnHighRiskScore: number;
  alertOnVolumeUsd: number;
  alertOnLiquidityUsd: number;
  alertOnNewToken: boolean;
  telegramEnabled: boolean;
}

export interface PlatformSettings {
  heliusStreamEnabled: boolean;
  pumpPortalAutoReconnect: boolean;
  demoSampleEnabled: boolean;
  marketCacheTtlSeconds: number;
  alertRules: AlertRulesConfig;
  updatedAt: string;
}

export interface OverviewResponse {
  metrics: {
    totalDetectedTokens: number;
    tokensDetectedToday: number;
    newLaunches: number;
    migratedTokens: number;
    totalMonitoredVolumeUsd: number;
    highRiskAlerts: number;
  };
  collectorStatus: CollectorStatusState;
  latestTokens: TokenRecord[];
  recentMigrations: TokenRecord[];
  trendingTokens: TokenRecord[];
  recentAlerts: AlertItem[];
  recentLargeEvents: TokenEvent[];
  monitoredPrograms: MonitoredProgram[];
}

export interface TokenDetailResponse {
  token: TokenRecord;
  events: TokenEvent[];
  marketSnapshots: MarketSnapshot[];
  walletAnalytics: WalletAnalytics | null;
  riskAssessment: RiskAssessment | null;
  inWatchlist: boolean;
}

export type NavSection =
  | 'overview'
  | 'radar'
  | 'pumpfun'
  | 'trending'
  | 'analytics'
  | 'wallets'
  | 'risk'
  | 'watchlist'
  | 'alerts'
  | 'settings';
