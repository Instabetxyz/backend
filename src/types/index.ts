// ─────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────

export enum MarketStatus {
  Active = 'active',
  Resolved = 'resolved',
  Cancelled = 'cancelled',
}

export enum BetSide {
  Yes = 'yes',
  No = 'no',
}

export enum Outcome {
  Yes = 'yes',
  No = 'no',
}

export enum ResolutionReason {
  ConditionTriggered = 'condition_triggered',
  MaxDurationReached = 'max_duration_reached',
  Cancelled = 'cancelled',
}

export enum FollowMode {
  Copy = 'copy',
  Short = 'short',
  None = 'none',
}

// ─────────────────────────────────────────────────────────
// Database row shapes (snake_case, mirrors postgres)
// ─────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  wallet_address: string;
  is_agent: boolean;
  agent_id: string | null;
  created_at: Date;
}

export interface MarketRow {
  id: string;
  stream_id: string;
  on_chain_market_id: string;   // uint256 from contract, stored as TEXT to avoid overflow
  trio_job_id: string;
  title: string;
  condition: string;
  stream_url: string;
  status: MarketStatus;
  outcome: Outcome | null;
  resolution_reason: ResolutionReason | null;
  trio_explanation: string | null;
  resolved_at: Date | null;
  resolve_tx_hash: string | null;
  yes_pool_wei: string;
  no_pool_wei: string;
  created_by: string;
  is_agent_stream: boolean;
  starts_at: Date;
  ends_at: Date;
  tx_hash: string;
  created_at: Date;
}

export interface BetRow {
  id: string;
  market_id: string;
  user_id: string;
  side: BetSide;
  amount_wei: string;
  shares: string;
  tx_hash: string;
  placed_at: Date;
  claimed: boolean;
  pnl_wei: string | null;
}

export interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  wallet_address: string;
  inft_id: string;
  inft_tx_hash: string;
  inft_metadata_uri: string;
  og_storage_key: string;
  registry_tx_hash: string;
  strategy_config: Record<string, unknown>;
  registered_at: Date;
}

export interface AgentFollowRow {
  follower_id: string;
  agent_id: string;
  mode: FollowMode;
  copy_fraction: string;
  max_bet_wei: string | null;
  active_since: Date;
}

// ─────────────────────────────────────────────────────────
// API request / response shapes
// ─────────────────────────────────────────────────────────

export interface CreateStreamBody {
  stream_url: string;
  condition: string;
  title?: string;
  initial_liquidity_wei?: string;
}

export interface PlaceBetBody {
  side: BetSide;
  amount_wei: string;
}

export interface RegisterAgentBody {
  name: string;
  description?: string;
  wallet_address: string;
  strategy_config?: Record<string, unknown>;
  inft_metadata_uri?: string;
}

export interface FollowAgentBody {
  mode: FollowMode;
  copy_fraction?: number;
  max_bet_wei?: string;
}

export interface ListMarketsQuery {
  status?: 'active' | 'resolved' | 'all';
  created_by?: string;
  agent_only?: string;
  limit?: string;
  cursor?: string;
}

export interface ListAgentsQuery {
  sort_by?: 'pnl' | 'win_rate' | 'followers' | 'volume';
  limit?: string;
  cursor?: string;
}

// ─────────────────────────────────────────────────────────
// Market pool / odds helpers
// ─────────────────────────────────────────────────────────

export interface PoolState {
  yes_pool_wei: bigint;
  no_pool_wei: bigint;
}

export interface OddsSnapshot {
  yes_odds: number;
  no_odds: number;
  yes_pool_wei: string;
  no_pool_wei: string;
  total_volume_wei: string;
}

// ─────────────────────────────────────────────────────────
// Trio API types
// ─────────────────────────────────────────────────────────

export interface TrioValidateResponse {
  reachable: boolean;
  reason?: string;
}

export interface TrioMonitorJob {
  job_id: string;
  status: 'pending' | 'running' | 'stopped' | 'completed' | 'failed';
  created_at: string;
  stream_url: string;
  job_type: string;
}

export interface TrioWebhookPayload {
  job_id: string;
  type: 'job_started' | 'watch_triggered' | 'job_stopped' | 'error';
  triggered: boolean;
  explanation?: string;
  latency_ms?: number;
  stream_url: string;
  ts: number;
  stats?: {
    reason: ResolutionReason;
    checks_performed: number;
  };
}

// ─────────────────────────────────────────────────────────
// WebSocket event types
// ─────────────────────────────────────────────────────────

export type WsEventType =
  | 'odds_update'
  | 'bet_placed'
  | 'market_resolved'
  | 'stream_status'
  | 'agent_bet'
  | 'pong'
  | 'error';

export interface WsOddsUpdate {
  type: 'odds_update';
  market_id: string;
  yes_odds: number;
  no_odds: number;
  yes_pool_wei: string;
  no_pool_wei: string;
  total_volume_wei: string;
  last_bet_by: string;
  seconds_remaining: number;
  ts: number;
}

export interface WsBetPlacedBase {
  market_id: string;
  bet_id: string;
  user_id: string;
  is_agent: boolean;
  side: BetSide;
  amount_wei: string;
  shares: number;
  tx_hash: string;
  ts: number;
}

export interface WsBetPlaced extends WsBetPlacedBase {
  type: 'bet_placed';
}

export interface WsMarketResolved {
  type: 'market_resolved';
  market_id: string;
  outcome: Outcome;
  resolution_reason: ResolutionReason;
  trio_explanation: string | null;
  resolved_at: number;
  tx_hash: string;
  winning_pool_wei: string | null;
  total_pot_wei: string;
}

export interface WsStreamStatus {
  type: 'stream_status';
  market_id: string;
  stream_url: string;
  online: boolean;
  ts: number;
}

export interface WsAgentBet extends WsBetPlacedBase {
  type: 'agent_bet';
  agent_id: string;
  agent_name: string;
}

export type WsEvent =
  | WsOddsUpdate
  | WsBetPlaced
  | WsMarketResolved
  | WsStreamStatus
  | WsAgentBet;

export interface WsClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping';
  market_ids?: string[];
}

// ─────────────────────────────────────────────────────────
// Express augmentation — attach user to request
// ─────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  user_id: string;
  wallet_address: string;
  is_agent: boolean;
  agent_id: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// ─────────────────────────────────────────────────────────
// Generic API responses
// ─────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  total: number;
}