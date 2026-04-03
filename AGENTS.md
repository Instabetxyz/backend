# AGENTS.md - Developer Guidelines for StreamBet API

This file provides guidelines for agentic coding agents working on this codebase.

## Project Overview

StreamBet is a prediction market API built with Express, TypeScript, PostgreSQL, and Redis. It provides REST endpoints and WebSocket streaming for real-time market data.

## Build, Lint, and Test Commands

### Development
```bash
npm run dev     # Start dev server with hot reload (tsx watch)
```

### Build & Production
```bash
npm run build   # Compile TypeScript to dist/
npm run start   # Run production server from dist/
```

### Database
```bash
npm run migrate # Run database migrations
```

### Testing
**No test framework is currently configured.** To add tests:
```bash
npm install --save-dev vitest @vitest/coverage-v8
# Add to package.json: "test": "vitest", "test:run": "vitest run"
```

Run a single test file (once vitest is added):
```bash
npx vitest run src/routes/markets.test.ts
```

## Code Style Guidelines

### TypeScript Configuration
- **Strict mode enabled** - All strict checks must pass
- **Target:** ES2022
- **Module:** CommonJS
- Always use proper TypeScript types; avoid `any`

### Imports
```typescript
// External imports (alphabetical)
import express from 'express';
import jwt from 'jsonwebtoken';

// Internal imports (relative, alphabetical within group)
import { config } from '../config';
import { db } from '../db/client';
```

### Naming Conventions
- **Files:** kebab-case (e.g., `errorHandler.ts`, `streamRoutes.ts`)
- **Types/Interfaces:** PascalCase (e.g., `AuthenticatedUser`, `MarketData`)
- **Functions:** camelCase (e.g., `requireAuth`, `createApp`)
- **Constants:** SCREAMING_SNAKE_CASE (e.g., `MAX_BET_AMOUNT`)
- **DB tables/columns:** snake_case (e.g., `user_id`, `wallet_address`)

### Error Handling
- Use Express error handler middleware (must be last middleware)
- Return consistent error format: `{ error: string, message: string }`
- Use appropriate HTTP status codes:
  - 400 for bad request / validation errors
  - 401 for unauthorized
  - 403 for forbidden
  - 404 for not found
  - 500 for server errors (but avoid exposing internals)

```typescript
// Example route error handling
router.get('/endpoint', async (req, res, next) => {
  try {
    const result = await getData();
    res.json(result);
  } catch (err) {
    next(err); // Pass to global error handler
  }
});
```

### Async Functions
- Always use `async/await`
- Always wrap in try/catch and pass errors to `next(err)`
- For fire-and-forget operations (like analytics), catch and swallow:

```typescript
db.query('UPDATE api_keys SET last_used = NOW() WHERE user_id = $1', [user_id])
  .catch(() => {}); // Don't block response for analytics
```

### Logging
- Use console.log with prefixed tags:
  - `[DB]` for database operations
  - `[Redis]` for Redis operations
  - `[Server]` for server lifecycle
  - `[Auth]` for authentication events

```typescript
console.log('[DB] Connected');
console.error('[DB] Failed to connect:', err);
```

### Routes and Controllers
- Use Express Router for route modules
- Export default router from route files
- Group related endpoints in the same router
- Use `_` prefix for unused parameters:

```typescript
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
```

### Database
- Use parameterized queries to prevent SQL injection
- Use `db.query<T>()` with generic type for typed results
- Connection pooling via `pg` library

### WebSocket
- Attach WebSocket server to same HTTP server
- Use `/v1/stream/websocket` path for WebSocket connections

### Configuration
- All config via `src/config/index.ts`
- Environment variables in `.env` (never commit)
- Use `dotenv/config` at app entry point

### Security
- Use `helmet()` for security headers
- Use `cors()` for CORS
- Validate all input with `express-validator`
- Authenticate via JWT (users) or API keys (agents)

### File Organization
```
src/
├── app.ts           # Express app factory
├── config/          # Configuration
├── db/              # Database clients (PostgreSQL, Redis)
├── middleware/      # Express middleware (auth, error handling)
├── routes/          # Route handlers
├── types/           # TypeScript interfaces/types
└── websocket/       # WebSocket server
```

### Commit Messages
Use conventional commits:
- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code improvements
- `chore:` for maintenance tasks

Example: `feat: add user authentication via JWT`

## Before Submitting Changes

1. Run `npm run build` to verify TypeScript compiles
2. Ensure no `any` types are introduced
3. Check all error responses follow the `{ error, message }` format
