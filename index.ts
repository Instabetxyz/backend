import 'dotenv/config';
import http from 'http';
import { createApp } from './src/app';
import { config } from './src/config';
import { db } from './src/db/client';
import { redis } from './src/db/redis';
import { createWsServer } from './src/websocket/server';

async function bootstrap(): Promise<void> {
  // ── Verify DB connection ────────────────────────────────
  try {
    await db.query('SELECT 1');
    console.log('[DB] Connected');
  } catch (err) {
    console.error('[DB] Failed to connect:', err);
    process.exit(1);
  }

  // ── Verify Redis connection ─────────────────────────────
  try {
    await redis.connect();
    console.log('[Redis] Connected');
  } catch (err) {
    console.error('[Redis] Failed to connect:', err);
    process.exit(1);
  }

  // ── Create HTTP server ──────────────────────────────────
  const app = createApp();
  const server = http.createServer(app);

  // ── Attach WebSocket server to same HTTP server ─────────
  createWsServer(server);

  // ── Start listening ─────────────────────────────────────
  server.listen(config.port, () => {
    console.log(`[Server] Listening on port ${config.port} (${config.env})`);
    console.log(`[Server] WebSocket available at ws://localhost:${config.port}/v1/stream/websocket`);
  });

  // ── Graceful shutdown ───────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Server] ${signal} received — shutting down gracefully`);
    server.close(async () => {
      await redis.quit();
      await db.end();
      console.log('[Server] Shutdown complete');
      process.exit(0);
    });

    // Force exit if graceful shutdown hangs
    setTimeout(() => {
      console.error('[Server] Forced exit after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Fatal error:', err);
  process.exit(1);
});