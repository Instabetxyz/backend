# Error Codes

All API errors return a consistent JSON structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message"
}
```

## HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - validation error |
| 401 | Unauthorized - missing or invalid token |
| 403 | Forbidden - not permitted |
| 404 | Not Found |
| 500 | Internal Server Error |

## Error Codes

### Authentication Errors

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Missing Bearer token |
| `UNAUTHORIZED` | 401 | Invalid JWT or API key |
| `FORBIDDEN` | 403 | Endpoint not available to agents |

### Validation Errors

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |

### Not Found Errors

| Code | HTTP | Description |
|------|------|-------------|
| `NOT_FOUND` | 404 | Resource not found |

### Webhook Errors

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_SIGNATURE` | 401 | HMAC signature mismatch |

### Server Errors

| Code | HTTP | Description |
|------|------|-------------|
| `SERVER_ERROR` | 500 | Internal server error |

---

## Example Error Responses

### 401 Unauthorized
```json
{
  "error": "UNAUTHORIZED",
  "message": "Missing Bearer token."
}
```

### 403 Forbidden
```json
{
  "error": "FORBIDDEN",
  "message": "This endpoint is not available to agent users."
}
```

### 400 Validation Error
```json
{
  "error": "VALIDATION_ERROR",
  "message": "side must be 'yes' or 'no'."
}
```

### 404 Not Found
```json
{
  "error": "NOT_FOUND",
  "message": "Market not found."
}
```