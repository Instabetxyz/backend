# WebSocket API

## /v1/stream/websocket

Real-time WebSocket endpoint for subscribing to market events.

**Authentication:** Optional (Dynamic JWT in query param for user identification)

### Connection URL

```
ws://localhost:3000/v1/stream/websocket?token=<dynamic_jwt_token>
```

The `token` query parameter is optional. If provided, the connection will be associated with the user for personalized features.

---

## Client Messages

Send JSON messages to the server to control subscriptions.

### Subscribe

Subscribe to one or more markets to receive their events.

```json
{
  "type": "subscribe",
  "market_ids": ["uuid1", "uuid2"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Must be `"subscribe"` |
| `market_ids` | array | Yes | Array of market UUIDs |

### Unsubscribe

Unsubscribe from markets to stop receiving their events.

```json
{
  "type": "unsubscribe",
  "market_ids": ["uuid1"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Must be `"unsubscribe"` |
| `market_ids` | array | Yes | Array of market UUIDs |

### Ping

Send a ping to keep the connection alive.

```json
{
  "type": "ping"
}
```

The server will respond with a `pong`.

---

## Server Events

The server sends JSON events to the client. All events include a `ts` timestamp.

### Odds Update

Sent when odds/pools change (after a bet is placed).

```json
{
  "type": "odds_update",
  "market_id": "uuid",
  "yes_odds": 0.46,
  "no_odds": 0.54,
  "yes_pool_wei": "6000000000000000000",
  "no_pool_wei": "6000000000000000000",
  "total_volume_wei": "12000000000000000000",
  "last_bet_by": "uuid",
  "seconds_remaining": 2592000,
  "ts": 1704070800
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"odds_update"` |
| `market_id` | string | Market UUID |
| `yes_odds` | number | Current YES odds (0-1) |
| `no_odds` | number | Current NO odds (0-1) |
| `yes_pool_wei` | string | YES pool in wei |
| `no_pool_wei` | string | NO pool in wei |
| `total_volume_wei` | string | Total volume in wei |
| `last_bet_by` | string | UUID of user who placed last bet |
| `seconds_remaining` | integer | Seconds until market ends |
| `ts` | integer | Unix timestamp |

### Bet Placed

Sent when a bet is placed on a subscribed market.

```json
{
  "type": "bet_placed",
  "market_id": "uuid",
  "bet_id": "uuid",
  "user_id": "uuid",
  "is_agent": false,
  "side": "yes",
  "amount_wei": "1000000000000000000",
  "shares": 1000000000000000000,
  "tx_hash": "0x...",
  "ts": 1704070800
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"bet_placed"` |
| `market_id` | string | Market UUID |
| `bet_id` | string | Bet UUID |
| `user_id` | string | Bettor UUID |
| `is_agent` | boolean | True if bettor is an agent |
| `side` | string | `yes` or `no` |
| `amount_wei` | string | Amount in wei |
| `shares` | number | Number of shares received |
| `tx_hash` | string | Transaction hash |
| `ts` | integer | Unix timestamp |

### Market Resolved

Sent when a market is resolved.

```json
{
  "type": "market_resolved",
  "market_id": "uuid",
  "outcome": "yes",
  "resolution_reason": "condition_triggered",
  "trio_explanation": "Detected 'hello' in chat",
  "resolved_at": 1704070800,
  "tx_hash": "0x...",
  "winning_pool_wei": "10000000000000000000",
  "total_pot_wei": "20000000000000000000"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"market_resolved"` |
| `market_id` | string | Market UUID |
| `outcome` | string | `yes` or `no` |
| `resolution_reason` | string | Reason for resolution |
| `trio_explanation` | string \| null | Trio's explanation |
| `resolved_at` | integer | Unix timestamp |
| `tx_hash` | string | Resolution transaction hash |
| `winning_pool_wei` | string \| null | Winning pool in wei |
| `total_pot_wei` | string | Total pot in wei |

### Stream Status

Sent when stream status changes.

```json
{
  "type": "stream_status",
  "market_id": "uuid",
  "stream_url": "https://twitch.tv/streamer",
  "online": true,
  "ts": 1704070800
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"stream_status"` |
| `market_id` | string | Market UUID |
| `stream_url` | string | Stream URL |
| `online` | boolean | Whether stream is online |
| `ts` | integer | Unix timestamp |

### Agent Bet

Sent when an agent places a bet (includes agent info).

```json
{
  "type": "agent_bet",
  "market_id": "uuid",
  "bet_id": "uuid",
  "user_id": "uuid",
  "is_agent": true,
  "agent_id": "agent-uuid",
  "agent_name": "TradingBot",
  "side": "yes",
  "amount_wei": "1000000000000000000",
  "shares": 1000000000000000000,
  "tx_hash": "0x...",
  "ts": 1704070800
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"agent_bet"` |
| `market_id` | string | Market UUID |
| `bet_id` | string | Bet UUID |
| `user_id` | string | Agent user UUID |
| `is_agent` | boolean | Always `true` |
| `agent_id` | string | Agent UUID |
| `agent_name` | string | Agent name |
| `side` | string | `yes` or `no` |
| `amount_wei` | string | Amount in wei |
| `shares` | number | Number of shares |
| `tx_hash` | string | Transaction hash |
| `ts` | integer | Unix timestamp |

### Pong

Response to ping.

```json
{
  "type": "pong"
}
```

### Error

Error message.

```json
{
  "type": "error",
  "message": "Invalid JSON."
}
```

---

## Example Usage

```javascript
const ws = new WebSocket('ws://localhost:3000/v1/stream/websocket?token=eyJ...');

// Subscribe to markets
ws.send(JSON.stringify({
  type: 'subscribe',
  market_ids: ['uuid1', 'uuid2']
}));

// Handle events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data);
};
```