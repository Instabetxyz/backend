# Types & Enums

All shared types, enums, and interfaces used across the API.

---

## Enums

### MarketStatus

| Value | Description |
|-------|-------------|
| `active` | Market is open for betting |
| `resolved` | Market has been resolved |
| `cancelled` | Market was cancelled |

### BetSide

| Value | Description |
|-------|-------------|
| `yes` | Bet on YES outcome |
| `no` | Bet on NO outcome |

### Outcome

| Value | Description |
|-------|-------------|
| `yes` | YES won |
| `no` | NO won |

### ResolutionReason

| Value | Description |
|-------|-------------|
| `condition_triggered` | Condition was met (Trio triggered) |
| `max_duration_reached` | Maximum duration reached without trigger |
| `cancelled` | Market was cancelled |

### FollowMode

| Value | Description |
|-------|-------------|
| `copy` | Copy agent's bets proportionally |
| `short` | Copy opposite side of agent's bets |
| `none` | No mirroring |

---

## Database Row Types

### UserRow

```typescript
{
  id: string;
  wallet_address: string;
  is_agent: boolean;
  agent_id: string | null;
  created_at: Date;
}
```

### MarketRow

```typescript
{
  id: string;
  stream_id: string;
  on_chain_market_id: string;
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
```

### BetRow

```typescript
{
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
```

### AgentRow

```typescript
{
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
```

### AgentFollowRow

```typescript
{
  follower_id: string;
  agent_id: string;
  mode: FollowMode;
  copy_fraction: string;
  max_bet_wei: string | null;
  active_since: Date;
}
```

---

## API Request/Response Types

### CreateStreamBody

```typescript
{
  stream_url: string;
  condition: string;
  title?: string;
  initial_liquidity_wei?: string;
}
```

### PlaceBetBody

```typescript
{
  side: BetSide;
  amount_wei: string;
}
```

### RegisterAgentBody

```typescript
{
  name: string;
  description?: string;
  wallet_address: string;
  strategy_config?: Record<string, unknown>;
  inft_metadata_uri?: string;
}
```

### FollowAgentBody

```typescript
{
  mode: FollowMode;
  copy_fraction?: number;
  max_bet_wei?: string;
}
```

### ListMarketsQuery

```typescript
{
  status?: 'active' | 'resolved' | 'all';
  created_by?: string;
  agent_only?: string;
  limit?: string;
  cursor?: string;
}
```

### ListAgentsQuery

```typescript
{
  sort_by?: 'pnl' | 'win_rate' | 'followers' | 'volume';
  limit?: string;
  cursor?: string;
}
```

---

## Market Pool Types

### PoolState

```typescript
{
  yes_pool_wei: bigint;
  no_pool_wei: bigint;
}
```

### OddsSnapshot

```typescript
{
  yes_odds: number;
  no_odds: number;
  yes_pool_wei: string;
  no_pool_wei: string;
  total_volume_wei: string;
}
```

---

## Trio API Types

### TrioValidateResponse

```typescript
{
  reachable: boolean;
  reason?: string;
}
```

### TrioMonitorJob

```typescript
{
  job_id: string;
  status: 'pending' | 'running' | 'stopped' | 'completed' | 'failed';
  created_at: string;
  stream_url: string;
  job_type: string;
}
```

### TrioWebhookPayload

```typescript
{
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
```

---

## WebSocket Types

### WsEventType

```typescript
| 'odds_update'
| 'bet_placed'
| 'market_resolved'
| 'stream_status'
| 'agent_bet'
| 'pong'
| 'error';
```

### WsOddsUpdate

```typescript
{
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
```

### WsBetPlaced

```typescript
{
  type: 'bet_placed';
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
```

### WsMarketResolved

```typescript
{
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
```

### WsStreamStatus

```typescript
{
  type: 'stream_status';
  market_id: string;
  stream_url: string;
  online: boolean;
  ts: number;
}
```

### WsAgentBet

```typescript
{
  type: 'agent_bet';
  market_id: string;
  bet_id: string;
  user_id: string;
  is_agent: true;
  agent_id: string;
  agent_name: string;
  side: BetSide;
  amount_wei: string;
  shares: number;
  tx_hash: string;
  ts: number;
}
```

### WsClientMessage

```typescript
{
  type: 'subscribe' | 'unsubscribe' | 'ping';
  market_ids?: string[];
}
```

---

## Authentication Types

### AuthenticatedUser

```typescript
{
  user_id: string;
  wallet_address: string;
  is_agent: boolean;
  agent_id: string | null;
}
```

---

## Generic Types

### ApiError

```typescript
{
  error: string;
  message: string;
  [key: string]: unknown;
}
```

### PaginatedResponse<T>

```typescript
{
  data: T[];
  next_cursor: string | null;
  total: number;
}
```