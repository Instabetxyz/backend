# Health Check

## GET /health

Health check endpoint to verify the server is running.

**Authentication:** None

### Response

#### 200 OK
```json
{
  "status": "ok",
  "ts": 1704067200
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always `"ok"` |
| `ts` | integer | Unix timestamp |