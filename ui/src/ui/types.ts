export type UpdateAvailable = import("../../../src/infra/update-startup.js").UpdateAvailable;

export type ChannelsStatusSnapshot = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: ChannelUiMetaEntry[];
  channels: Record<string, unknown>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
};

export type ChannelUiMetaEntry = {
  id: string;
  label: string;
  detailLabel: string;
  systemImage?: string;
};

export const CRON_CHANNEL_LAST = "last";

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  dmPolicy?: string | null;
  allowFrom?: string[] | null;
  tokenSource?: string | null;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  allowUnmentionedGroups?: boolean | null;
  cliPath?: string | null;
  dbPath?: string | null;
  port?: number | null;
  probe?: unknown;
  audit?: unknown;
  application?: unknown;
};

export type WhatsAppSelf = {
  e164?: string | null;
  jid?: string | null;
};

export type WhatsAppDisconnect = {
  at: number;
  status?: number | null;
  error?: string | null;
  loggedOut?: boolean | null;
};

export type WhatsAppStatus = {
  configured: boolean;
  linked: boolean;
  authAgeMs?: number | null;
  self?: WhatsAppSelf | null;
  running: boolean;
  connected: boolean;
  lastConnectedAt?: number | null;
  lastDisconnect?: WhatsAppDisconnect | null;
  reconnectAttempts: number;
  lastMessageAt?: number | null;
  lastEventAt?: number | null;
  lastError?: string | null;
};

export type TelegramBot = {
  id?: number | null;
  username?: string | null;
};

export type TelegramWebhook = {
  url?: string | null;
  hasCustomCert?: boolean | null;
};

export type TelegramProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: TelegramBot | null;
  webhook?: TelegramWebhook | null;
};

export type TelegramStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  mode?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: TelegramProbe | null;
  lastProbeAt?: number | null;
};

export type DiscordBot = {
  id?: string | null;
  username?: string | null;
};

export type DiscordProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: DiscordBot | null;
};

export type DiscordStatus = {
  configured: boolean;
  tokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: DiscordProbe | null;
  lastProbeAt?: number | null;
};

export type GoogleChatProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
};

export type GoogleChatStatus = {
  configured: boolean;
  credentialSource?: string | null;
  audienceType?: string | null;
  audience?: string | null;
  webhookPath?: string | null;
  webhookUrl?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: GoogleChatProbe | null;
  lastProbeAt?: number | null;
};

export type SlackBot = {
  id?: string | null;
  name?: string | null;
};

export type SlackTeam = {
  id?: string | null;
  name?: string | null;
};

export type SlackProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: SlackBot | null;
  team?: SlackTeam | null;
};

export type SlackStatus = {
  configured: boolean;
  botTokenSource?: string | null;
  appTokenSource?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SlackProbe | null;
  lastProbeAt?: number | null;
};

export type SignalProbe = {
  ok: boolean;
  status?: number | null;
  error?: string | null;
  elapsedMs?: number | null;
  version?: string | null;
};

export type SignalStatus = {
  configured: boolean;
  baseUrl: string;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  probe?: SignalProbe | null;
  lastProbeAt?: number | null;
};

export type IMessageProbe = {
  ok: boolean;
  error?: string | null;
};

export type IMessageStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  cliPath?: string | null;
  dbPath?: string | null;
  probe?: IMessageProbe | null;
  lastProbeAt?: number | null;
};

export type NostrProfile = {
  name?: string | null;
  displayName?: string | null;
  about?: string | null;
  picture?: string | null;
  banner?: string | null;
  website?: string | null;
  nip05?: string | null;
  lud16?: string | null;
};

export type NostrStatus = {
  configured: boolean;
  publicKey?: string | null;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  profile?: NostrProfile | null;
};

export type MSTeamsProbe = {
  ok: boolean;
  error?: string | null;
  appId?: string | null;
};

export type MSTeamsStatus = {
  configured: boolean;
  running: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  port?: number | null;
  probe?: MSTeamsProbe | null;
  lastProbeAt?: number | null;
};

export type ConfigSnapshotIssue = {
  path: string;
  message: string;
};

export type ConfigSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  raw?: string | null;
  hash?: string | null;
  parsed?: unknown;
  valid?: boolean | null;
  config?: Record<string, unknown> | null;
  issues?: ConfigSnapshotIssue[] | null;
};

export type ConfigUiHint = {
  label?: string;
  help?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
};

export type ConfigUiHints = Record<string, ConfigUiHint>;

export type ConfigSchemaResponse = {
  schema: unknown;
  uiHints: ConfigUiHints;
  version: string;
  generatedAt: string;
};

export type PresenceEntry = {
  instanceId?: string | null;
  host?: string | null;
  ip?: string | null;
  version?: string | null;
  platform?: string | null;
  deviceFamily?: string | null;
  modelIdentifier?: string | null;
  roles?: string[] | null;
  scopes?: string[] | null;
  mode?: string | null;
  lastInputSeconds?: number | null;
  reason?: string | null;
  text?: string | null;
  ts?: number | null;
};

export type GatewaySessionsDefaults = {
  model: string | null;
  contextTokens: number | null;
};

export type GatewayAgentRow = {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
};

export type AgentsListResult = {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: GatewayAgentRow[];
};

export type AgentIdentityResult = {
  agentId: string;
  name: string;
  avatar: string;
  emoji?: string;
};

export type AgentFileEntry = {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
  content?: string;
};

export type AgentsFilesListResult = {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
};

export type AgentsFilesGetResult = {
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type AgentsFilesSetResult = {
  ok: true;
  agentId: string;
  workspace: string;
  file: AgentFileEntry;
};

export type GatewaySessionRow = {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  surface?: string;
  subject?: string;
  room?: string;
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
};

export type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  defaults: GatewaySessionsDefaults;
  sessions: GatewaySessionRow[];
};

export type SessionsPatchResult = {
  ok: true;
  path: string;
  key: string;
  entry: {
    sessionId: string;
    updatedAt?: number;
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    elevatedLevel?: string;
  };
};

export type {
  CostUsageDailyEntry,
  CostUsageSummary,
  SessionsUsageEntry,
  SessionsUsageResult,
  SessionsUsageTotals,
  SessionUsageTimePoint,
  SessionUsageTimeSeries,
} from "./usage-types.ts";

export type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

export type CronSessionTarget = "main" | "isolated";
export type CronWakeMode = "next-heartbeat" | "now";

export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | {
      kind: "agentTurn";
      message: string;
      thinking?: string;
      timeoutSeconds?: number;
    };

export type CronDelivery = {
  mode: "none" | "announce" | "webhook";
  channel?: string;
  to?: string;
  bestEffort?: boolean;
};

export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

export type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: CronSessionTarget;
  wakeMode: CronWakeMode;
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
};

export type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  status: "ok" | "error" | "skipped";
  durationMs?: number;
  error?: string;
  summary?: string;
  sessionId?: string;
  sessionKey?: string;
};

export type SkillsStatusConfigCheck = {
  path: string;
  satisfied: boolean;
};

export type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

export type SkillStatusEntry = {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  bundled?: boolean;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: SkillsStatusConfigCheck[];
  install: SkillInstallOption[];
};

export type SkillStatusReport = {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
};

export type StatusSummary = Record<string, unknown>;

export type Web3BillingUsage = {
  creditsUsed: number;
  creditsQuota: number;
  llmCalls: number;
  toolCalls: number;
  lastActivity: string;
};

export type Web3BillingSummary = {
  enabled: boolean;
  sessionIdHash: string;
  usage: Web3BillingUsage | null;
};

export type Web3StatusSummary = {
  auditEventsRecent: number;
  auditLastAt: string | null;
  archiveProvider: string | null;
  archiveLastCid: string | null;
  archivePending: number;
  anchorNetwork: string | null;
  anchorLastTx: string | null;
  pendingAnchors: number;
  anchoringEnabled: boolean;
  resources?: {
    providers: number;
    total: number;
    byKind: Record<string, number>;
  };
  disputes?: {
    total: number;
    byStatus: Record<string, number>;
    open: number;
    investigating: number;
    resolved: number;
    rejected: number;
    expired: number;
  };
  alerts?: {
    total: number;
    active: number;
    byLevel: Record<string, number>;
  };
  queues?: {
    anchors: { pending: number; failed: number };
    archives: { pending: number; failed: number };
    settlements: { pending: number; failed: number };
  };
  brain?: {
    source: "web3/decentralized" | "centralized" | null;
    provider: string | null;
    model: string | null;
    availability: "ok" | "degraded" | "unavailable" | null;
  };
  billing?: {
    status: "active" | "exhausted" | "unbound";
    credits: number;
  };
  settlement?: {
    pending: number;
  };
};

export type Web3IndexResourceKind = "model" | "search" | "storage";

export type Web3IndexResource = {
  resourceId: string;
  kind: Web3IndexResourceKind;
  label?: string;
  description?: string;
  tags?: string[];
  price?: string;
  unit?: string;
};

export type Web3IndexSignature = {
  scheme: "ed25519";
  publicKey: string;
  signature: string;
  payloadHash: string;
  signedAt: string;
};

export type Web3IndexEntry = {
  providerId: string;
  resources: Web3IndexResource[];
  updatedAt: string;
  expiresAt?: string;
  lastHeartbeatAt?: string;
  signature?: Web3IndexSignature;
};

export type Web3IndexStats = {
  providers: number;
  resources: number;
  byKind: Record<string, number>;
};

export type Web3AlertSeverity = "p0" | "p1";

export type Web3Alert = {
  rule: string;
  severity: Web3AlertSeverity;
  triggered: boolean;
  value: number;
};

export type Web3MetricsSnapshot = {
  audit: { total: number; byKind: Record<string, number> };
  anchoring: { enabled: boolean; pending: number };
  archive: { provider: string | null; pending: number };
  settlement: { pending: number };
  billing: { enabled: boolean; usageRecords: number; creditsUsed: number };
  resources: { providers: number; total: number; byKind: Record<string, number> };
  disputes: {
    total: number;
    byStatus: Record<string, number>;
    open: number;
    investigating: number;
    resolved: number;
    rejected: number;
    expired: number;
  };
  alerts: Web3Alert[];
};

export type Web3MonitorSnapshot = {
  web3: Web3MetricsSnapshot;
  market: MarketMetricsSnapshot | null;
  marketError: string | null;
};

export type MarketStatusSummary = {
  offers: Record<string, number>;
  orders: Record<string, number>;
  deliveries: Record<string, number>;
  settlements: Record<string, number>;
  leases: {
    total: number;
    byStatus: Record<string, number>;
    active: number;
    expired: number;
    revoked: number;
  };
  disputes: {
    total: number;
    byStatus: Record<string, number>;
    open: number;
    resolved: number;
    rejected: number;
  };
  revocations: {
    total: number;
    pending: number;
    failed: number;
  };
  audit: {
    events: number;
    anchorPending: number;
  };
  repair: {
    candidates: number;
    expiredActive: number;
    orphaned: number;
  };
  totals: {
    offers: number;
    orders: number;
    deliveries: number;
    settlements: number;
  };
};

export type MarketAlertSeverity = "p0" | "p1";

export type MarketAlert = {
  rule: string;
  severity: MarketAlertSeverity;
  triggered: boolean;
  value: number;
};

export type MarketMetricsGroup = {
  total: number;
  byStatus: Record<string, number>;
};

export type MarketSettlementMetrics = MarketMetricsGroup & {
  failureRate: number;
};

export type MarketLeaseMetrics = MarketMetricsGroup & {
  active: number;
  expired: number;
  revoked: number;
};

export type MarketDisputeMetrics = MarketMetricsGroup & {
  open: number;
  resolved: number;
  rejected: number;
};

export type MarketRevocationMetrics = {
  total: number;
  pending: number;
  failed: number;
};

export type MarketAuditMetrics = {
  events: number;
  anchorPending: number;
};

export type MarketMetricsSnapshot = {
  offers: MarketMetricsGroup;
  orders: MarketMetricsGroup;
  settlements: MarketSettlementMetrics;
  leases: MarketLeaseMetrics;
  disputes: MarketDisputeMetrics;
  revocations: MarketRevocationMetrics;
  audit: MarketAuditMetrics;
  alerts: MarketAlert[];
};

export type MarketReputationSummary = {
  providerActorId?: string;
  resourceId?: string;
  score: number;
  signals: string[];
  leases: {
    total: number;
    byStatus: Record<string, number>;
  };
  disputes: {
    total: number;
    byStatus: Record<string, number>;
  };
  ledger: {
    totalCost: string;
    currency: string;
  };
};

export type TokenEconomyState = {
  status: "token_draft" | "token_active" | "token_paused";
  policy: {
    symbol: string;
    name?: string;
    decimals?: number;
    chain?: string;
    tokenAddress?: string;
    emission?: {
      rate: string;
      period: "day" | "week" | "month";
      cap?: string;
    };
    burn?: {
      burnRateBps?: number;
    };
    governance?: {
      quorumBps?: number;
      votingPeriodDays?: number;
      proposalThreshold?: string;
    };
  };
  totals: {
    minted: string;
    burned: string;
    totalSupply: string;
    circulating: string;
  };
  updatedAt: string;
};

export type CrossChainAsset = {
  assetId: string;
  symbol: string;
  decimals: number;
  chains: string[];
};

export type BridgeRoute = {
  routeId: string;
  fromChain: string;
  toChain: string;
  assetSymbol: string;
  minAmount?: string;
  maxAmount?: string;
  feeBps?: number;
  estimatedSeconds?: number;
  provider?: string;
};

export type BridgeTransfer = {
  bridgeId: string;
  orderId?: string;
  settlementId?: string;
  routeId: string;
  fromChain: string;
  toChain: string;
  assetSymbol: string;
  amount: string;
  status: "bridge_requested" | "bridge_in_flight" | "bridge_completed" | "bridge_failed";
  txHash?: string;
  failureReason?: string;
  requestedAt: string;
  updatedAt: string;
};

export type BridgeRoutesSnapshot = {
  assets: CrossChainAsset[];
  routes: BridgeRoute[];
};

export type MarketResourceKind = "model" | "search" | "storage";
export type MarketResourceStatus = "resource_draft" | "resource_published" | "resource_unpublished";
export type MarketLeaseStatus = "lease_active" | "lease_revoked" | "lease_expired";
export type MarketDisputeStatus =
  | "dispute_opened"
  | "dispute_evidence_submitted"
  | "dispute_resolved"
  | "dispute_rejected";

export type MarketPrice = {
  unit: "token" | "call" | "query" | "gb_day" | "put" | "get";
  amount: string;
  currency: string;
  tokenAddress?: string;
};

export type MarketResource = {
  resourceId: string;
  kind: MarketResourceKind;
  status: MarketResourceStatus;
  providerActorId: string;
  offerId?: string;
  label: string;
  description?: string;
  tags?: string[];
  price: MarketPrice;
  updatedAt?: string;
};

export type MarketLease = {
  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;
  providerActorId: string;
  consumerActorId: string;
  orderId: string;
  status: MarketLeaseStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type MarketLedgerSummary = {
  byUnit: Record<string, { quantity: string; cost: string }>;
  totalCost: string;
  currency: string;
};

export type MarketLedgerUnit = "token" | "call" | "query" | "byte";

export type MarketLedgerEntry = {
  ledgerId: string;
  timestamp: string;
  leaseId: string;
  resourceId: string;
  kind: MarketResourceKind;
  providerActorId: string;
  consumerActorId: string;
  unit: MarketLedgerUnit;
  quantity: string;
  cost: string;
  currency: string;
  tokenAddress?: string;
  sessionId?: string;
  runId?: string;
  entryHash: string;
};

export type MarketDispute = {
  disputeId: string;
  orderId: string;
  initiatorActorId: string;
  respondentActorId: string;
  reason: string;
  status: MarketDisputeStatus;
  openedAt: string;
  resolvedAt?: string;
};

export type MarketResourceStatusFilter = MarketResourceStatus | "all";
export type MarketLeaseStatusFilter = MarketLeaseStatus | "all";
export type MarketDisputeStatusFilter = MarketDisputeStatus | "all";
export type MarketLedgerUnitFilter = MarketLedgerUnit | "all";

export type MarketResourceSort = "updated_desc" | "updated_asc";
export type MarketLeaseSort = "issued_desc" | "issued_asc";
export type MarketDisputeSort = "opened_desc" | "opened_asc";
export type MarketLedgerSort = "time_desc" | "time_asc";

export type MarketFilters = {
  resourceSearch: string;
  resourceStatus: MarketResourceStatusFilter;
  resourceSort: MarketResourceSort;
  leaseSearch: string;
  leaseStatus: MarketLeaseStatusFilter;
  leaseSort: MarketLeaseSort;
  disputeSearch: string;
  disputeStatus: MarketDisputeStatusFilter;
  disputeSort: MarketDisputeSort;
  ledgerSearch: string;
  ledgerUnit: MarketLedgerUnitFilter;
  ledgerSort: MarketLedgerSort;
};

export type HealthSnapshot = Record<string, unknown>;

/** Strongly-typed health response from the gateway (richer than HealthSnapshot). */
export type HealthSummary = {
  ok: boolean;
  ts: number;
  durationMs: number;
  heartbeatSeconds: number;
  defaultAgentId: string;
  agents: Array<{ id: string; name?: string }>;
  sessions: {
    path: string;
    count: number;
    recent: Array<{
      key: string;
      updatedAt: number | null;
      age: number | null;
    }>;
  };
};

/** A model entry returned by the gateway model-catalog endpoint. */
export type ModelCatalogEntry = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: Array<"text" | "image">;
};

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogEntry = {
  raw: string;
  time?: string | null;
  level?: LogLevel | null;
  subsystem?: string | null;
  message?: string | null;
  meta?: Record<string, unknown> | null;
};

// ── Attention ───────────────────────────────────────

export type AttentionSeverity = "error" | "warning" | "info";

export type AttentionItem = {
  severity: AttentionSeverity;
  icon: string;
  title: string;
  description: string;
  href?: string;
  external?: boolean;
};
