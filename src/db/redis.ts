import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});

// ─────────────────────────────────────────────────────────
// Key builders — centralise key naming
// ─────────────────────────────────────────────────────────

export const keys = {
  /** Cached odds snapshot for a market — JSON string */
  marketOdds: (marketId: string) => `market:odds:${marketId}`,

  /** Expiry sentinel for a market's betting window */
  marketExpiry: (marketId: string) => `market:expiry:${marketId}`,

  /** Lock to prevent duplicate resolution processing */
  resolutionLock: (marketId: string) => `market:resolving:${marketId}`,

  /** Maps trio job_id → market_id */
  trioJobMarket: (jobId: string) => `trio:job:${jobId}`,

  /** Agent follow list for a user */
  userFollows: (userId: string) => `user:follows:${userId}`,
} as const;

// ─────────────────────────────────────────────────────────
// Typed helpers
// ─────────────────────────────────────────────────────────

/**
 * Store Trio job_id → market_id mapping.
 * TTL: 10 minutes (market is 90s; this is generous cleanup margin).
 */
export async function setTrioJobMapping(
  jobId: string,
  marketId: string,
): Promise<void> {
  await redis.set(keys.trioJobMarket(jobId), marketId, 'EX', 600);
}

/**
 * Retrieve market_id from a Trio job_id.
 */
export async function getMarketIdByTrioJob(
  jobId: string,
): Promise<string | null> {
  return redis.get(keys.trioJobMarket(jobId));
}

/**
 * Set market betting-window expiry.
 * When the key expires, a subscriber triggers NO resolution.
 * TTL = seconds until market ends.
 */
export async function setMarketExpiry(
  marketId: string,
  ttlSeconds: number,
): Promise<void> {
  await redis.set(keys.marketExpiry(marketId), '1', 'EX', ttlSeconds);
}

/**
 * Acquire a resolution lock (prevents double-resolution).
 * Returns true if lock was acquired, false if already held.
 */
export async function acquireResolutionLock(
  marketId: string,
): Promise<boolean> {
  const result = await redis.set(
    keys.resolutionLock(marketId),
    '1',
    'EX',
    30,
    'NX',
  );
  return result === 'OK';
}

/**
 * Cache a market's current odds as JSON.
 * TTL: 2 minutes (refreshed on every bet).
 */
export async function cacheMarketOdds(
  marketId: string,
  odds: object,
): Promise<void> {
  await redis.set(keys.marketOdds(marketId), JSON.stringify(odds), 'EX', 120);
}

/**
 * Read cached odds for a market.
 */
export async function getCachedMarketOdds(
  marketId: string,
): Promise<object | null> {
  const raw = await redis.get(keys.marketOdds(marketId));
  return raw ? (JSON.parse(raw) as object) : null;
}