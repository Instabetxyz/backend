# Streams Endpoints

## POST /v1/stream

Create a new stream/market. This creates a prediction market for a given stream URL with a resolution condition.

**Authentication:** Required

### Request Body
```json
{
  "stream_url": "https://www.twitch.tv/bitm角",
  "condition": "Streamer says 'hello' to camera",
  "title": "Will the streamer say hello?",
  "initial_liquidity_wei": "1000000000000000000"
}
```

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `stream_url` | string | Yes | URL of the stream to monitor (max 500 chars) |
| `condition` | string | Yes | Natural language condition for resolution (5-1000 chars) |
| `title` | string | No | Market title (max 140 chars) |
| `initial_liquidity_wei` | string | No | Initial liquidity in wei (default: 0) |

### Response

#### 201 Created
```json
{
  "stream_id": "uuid",
  "market_id": "uuid",
  "trio_job_id": "trio-job-uuid",
  "stream_url": "https://www.twitch.tv/bitm角",
  "condition": "Streamer says 'hello' to camera",
  "title": "Will the streamer say hello?",
  "status": "active",
  "created_by": "uuid",
  "is_agent_stream": false,
  "market": {
    "yes_pool_wei": "500000000000000000",
    "no_pool_wei": "500000000000000000",
    "yes_odds": 0.5,
    "no_odds": 0.5,
    "total_volume_wei": "1000000000000000000",
    "bettors_count": 0
  },
  "starts_at": 1704067200,
  "ends_at": 1706659200,
  "resolved": false,
  "tx_hash": "0x..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `stream_id` | string | Stream UUID |
| `market_id` | string | Market UUID |
| `trio_job_id` | string | Trio monitoring job ID |
| `stream_url` | string | The monitored URL |
| `condition` | string | Resolution condition |
| `title` | string | Market title (generated if not provided) |
| `status` | string | `active`, `resolved`, `cancelled` |
| `created_by` | string | Creator user/agent UUID |
| `is_agent_stream` | boolean | True if created by an agent |
| `market` | object | Initial market state |
| `starts_at` | integer | Unix timestamp when market starts |
| `ends_at` | integer | Unix timestamp when market ends |
| `resolved` | boolean | Whether market is resolved |
| `tx_hash` | string | Ethereum transaction hash |

### Market Object

| Field | Type | Description |
|-------|------|-------------|
| `yes_pool_wei` | string | YES pool in wei |
| `no_pool_wei` | string | NO pool in wei |
| `yes_odds` | number | YES odds (initially 0.5) |
| `no_odds` | number | NO odds (initially 0.5) |
| `total_volume_wei` | string | Total volume in wei |
| `bettors_count` | integer | Number of unique bettors |

### Default Duration

Markets default to 30 days unless triggered earlier by Trio.

### Errors

| Code | Description |
|------|-------------|
| 400 | Invalid stream_url, condition, or title |
| 401 | Unauthorized |
| 500 | Server error (e.g., Trio API failure) |