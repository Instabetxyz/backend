import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { config } from '../config';
import { db } from '../db/client';
import type { AuthenticatedUser } from '../types';

// ─────────────────────────────────────────────────────────
// JWKS client — fetches Dynamic's public keys and caches them
// ─────────────────────────────────────────────────────────

const jwksClient = new JwksClient({
  jwksUri: `https://app.dynamic.xyz/api/v0/sdk/${config.auth.dynamicEnvId}/.well-known/jwks`,
  rateLimit: true,
  cache: true,
  cacheMaxEntries: 5,
  // Re-fetch keys after 10 minutes
  cacheMaxAge: 600_000,
});

// ─────────────────────────────────────────────────────────
// Dynamic JWT payload shape (access token / minJwt)
// ─────────────────────────────────────────────────────────

interface DynamicJwtPayload {
  sub: string;           // Dynamic user ID
  iss: string;           // app.dynamic.xyz/<env_id>
  aud: string;
  iat: number;
  exp: number;
  scope: string;         // space-separated, must include "user:basic"
  environment_id: string;
  verified_credentials?: Array<{
    address?: string;
    chain?: string;
    wallet_name?: string;
    id: string;
  }>;
  verified_account?: {
    address: string;
    chain: string;
  };
  email?: string;
  alias?: string;
}

// ─────────────────────────────────────────────────────────
// Core verification — exported for reuse (e.g. WS auth)
// ─────────────────────────────────────────────────────────

export async function verifyDynamicToken(token: string): Promise<DynamicJwtPayload> {
  // Decode header to get `kid` (key ID) for JWKS lookup
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Malformed JWT.');
  }

  const kid = decoded.header.kid;
  const signingKey = await jwksClient.getSigningKey(kid);
  const publicKey = signingKey.getPublicKey();

  // Verify signature + standard claims (exp, iss, aud)
  const payload = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: `app.dynamic.xyz/${config.auth.dynamicEnvId}`,
  }) as DynamicJwtPayload;

  // Dynamic-specific: scope must include "user:basic" to confirm
  // the user has completed the full authentication flow
  const scopes = (payload.scope ?? '').split(' ');
  if (!scopes.includes('user:basic')) {
    throw new Error(
      `Authentication incomplete — scope "${payload.scope}" does not include user:basic.`,
    );
  }

  return payload;
}

// ─────────────────────────────────────────────────────────
// User upsert — lazily create our user row on first request
// ─────────────────────────────────────────────────────────

/**
 * Extract the primary EVM wallet address from Dynamic's verified_credentials.
 * Falls back to verified_account if the list is absent.
 */
function extractWalletAddress(payload: DynamicJwtPayload): string | null {
  if (payload.verified_account?.address) {
    return payload.verified_account.address.toLowerCase();
  }
  const evmCred = payload.verified_credentials?.find(
    (c) => c.chain === 'eip155' && c.address,
  );
  return evmCred?.address?.toLowerCase() ?? null;
}

async function upsertUser(payload: DynamicJwtPayload): Promise<{
  user_id: string;
  wallet_address: string;
  is_agent: boolean;
  agent_id: string | null;
}> {
  const walletAddress = extractWalletAddress(payload);

  if (!walletAddress) {
    throw new Error('No EVM wallet address found in Dynamic token.');
  }

  // Upsert on wallet_address — Dynamic sub is stable but wallet is our business key
  const { rows } = await db.query<{
    id: string;
    wallet_address: string;
    is_agent: boolean;
    agent_id: string | null;
  }>(
    `INSERT INTO users (wallet_address)
     VALUES ($1)
     ON CONFLICT (wallet_address) DO UPDATE
       SET wallet_address = EXCLUDED.wallet_address
     RETURNING id, wallet_address, is_agent, agent_id`,
    [walletAddress],
  );

  const user = rows[0];
  return {
    user_id: user.id,
    wallet_address: user.wallet_address,
    is_agent: user.is_agent,
    agent_id: user.agent_id,
  };
}

// ─────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────

/**
 * Strict auth — verifies Dynamic JWT or agent API key.
 * Attaches req.user on success; returns 401 on failure.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Bearer token.' });
    return;
  }

  const token = header.slice(7);

  // ── Agent API key path (sk_agent_...) ──────────────────
  if (token.startsWith('sk_agent_')) {
    await handleAgentApiKey(token, req, res, next);
    return;
  }

  // ── Dynamic JWT path ───────────────────────────────────
  try {
    const payload = await verifyDynamicToken(token);
    const user = await upsertUser(payload);

    // Block agent wallets from using Dynamic JWT auth
    if (user.is_agent) {
      res.status(403).json({
        error: 'AGENT_WALLET',
        message: 'This wallet belongs to an AI agent. Use the agent API key instead.',
      });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed.';
    res.status(401).json({ error: 'UNAUTHORIZED', message });
  }
}

/**
 * Optional auth — attaches req.user if a valid token is present,
 * continues either way. Use on public endpoints with optional personalisation.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      if (token.startsWith('sk_agent_')) {
        // Best-effort agent key lookup for optional auth
        const user = await resolveAgentApiKey(token);
        if (user) req.user = user;
      } else {
        const payload = await verifyDynamicToken(token);
        req.user = await upsertUser(payload);
      }
    } catch {
      // Invalid token — continue as anonymous
    }
  }
  next();
}

/**
 * Ensure the authenticated user is NOT an agent.
 * Must be used after requireAuth.
 */
export function requireHuman(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.is_agent) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'This endpoint is not available to agent users.',
    });
    return;
  }
  next();
}

// ─────────────────────────────────────────────────────────
// Agent API key helpers
// ─────────────────────────────────────────────────────────

import crypto from 'crypto';

async function resolveAgentApiKey(token: string): Promise<AuthenticatedUser | null> {
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await db.query<{
    user_id: string;
    wallet_address: string;
    agent_id: string;
  }>(
    `SELECT ak.user_id, u.wallet_address, u.agent_id
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = $1`,
    [keyHash],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    user_id: row.user_id,
    wallet_address: row.wallet_address,
    is_agent: true,
    agent_id: row.agent_id,
  };
}

async function handleAgentApiKey(
  token: string,
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await resolveAgentApiKey(token);
    if (!user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid API key.' });
      return;
    }
    req.user = user;
    // Update last_used asynchronously
    const keyHash = crypto.createHash('sha256').update(token).digest('hex');
    db.query('UPDATE api_keys SET last_used = NOW() WHERE key_hash = $1', [keyHash])
      .catch(() => {});
    next();
  } catch {
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Auth lookup failed.' });
  }
}