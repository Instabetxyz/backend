# Webhooks Endpoints

## POST /v1/webhook/trio

Receive events from Trio monitoring service. This endpoint handles market resolution events when the monitored condition is triggered.

**Authentication:** HMAC Signature Verification

### Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Trio-Signature` | string | Yes | HMAC-SHA256 signature of request body |

The signature is a 64-character hex string (SHA256 output), computed using the webhook secret configured in the server.

### Request Body
```json
{
  "job_id": "trio-job-uuid",
  "type": "watch_triggered",
  "triggered": true,
  "explanation": "Detected 'hello' in chat at 14:32:15 UTC",
  "latency_ms": 1500,
  "stream_url": "https://www.twitch.tv/bitm角",
  "ts": 1704070800,
  "stats": {
    "reason": "condition_triggered",
    "checks_performed": 42
  }
}
```

| Field | Type | Required | Description |
|------|------|----------|-------------|
| `job_id` | string | Yes | Trio job ID (maps to market) |
| `type` | string | Yes | Event type: `job_started`, `watch_triggered`, `job_stopped`, `error` |
| `triggered` | boolean | Yes | Whether the condition was triggered |
| `explanation` | string | No | Trio's explanation of why triggered |
| `latency_ms` | number | No | Processing latency |
| `stream_url` | string | Yes | The monitored stream URL |
| `ts` | number | Yes | Unix timestamp |
| `stats` | object | No | Additional statistics |

### Event Types

| Type | Description |
|------|-------------|
| `job_started` | Trio started monitoring |
| `watch_triggered` | Condition was triggered |
| `job_stopped` | Monitoring stopped (natural expiry) |
| `error` | Trio encountered an error |

### Response

#### 200 OK
```json
{
  "received": true
}
```

The endpoint responds immediately with 200 to acknowledge receipt. Resolution processing happens asynchronously after the response is sent.

### Processing Behavior

| Event | Action |
|-------|--------|
| `watch_triggered` + `triggered: true` | Resolve market as YES |
| `watch_triggered` + `triggered: false` | No action |
| `job_stopped` + `stats.reason: max_duration_reached` | Resolve market as NO |
| `job_started` | No action |
| `error` | Log only |

### Errors

| Code | Description |
|------|-------------|
| 401 | Invalid or missing X-Trio-Signature |
| 400 | Invalid payload format |

### Security

The signature is verified using constant-time comparison to prevent timing attacks:

```
signature = HMAC-SHA256(request_body, webhook_secret)
```

Ensure your webhook secret is kept secure and rotated periodically.