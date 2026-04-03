import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { db } from '../db/client';
import type { AuthenticatedUser } from '../types';

interface JwtPayload {
  user_id: string;
  wallet_address: string;
  is_agent: boolean;
  agent_id: string | null;
}

/**
 * Strict auth — rejects unauthenticated requests.
 * Supports both JWT (human users) and Bearer API key (agents).
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

  // ── Try JWT first ──────────────────────────────────────
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
    req.user = {
      user_id: payload.user_id,
      wallet_address: payload.wallet_address,
      is_agent: payload.is_agent,
      agent_id: payload.agent_id,
    };
    next();
    return;
  } catch {
    // Not a valid JWT — fall through to API key check
  }

  // ── Try API key (agents use sk_agent_... prefix) ───────
  if (token.startsWith('sk_agent_')) {
    try {
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

      if (rows.length === 0) {
        res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid API key.' });
        return;
      }

      const row = rows[0];
      req.user = {
        user_id: row.user_id,
        wallet_address: row.wallet_address,
        is_agent: true,
        agent_id: row.agent_id,
      };

      // Update last_used asynchronously — don't await
      db.query('UPDATE api_keys SET last_used = NOW() WHERE user_id = $1', [
        row.user_id,
      ]).catch(() => {});

      next();
      return;
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: 'Auth lookup failed.' });
      return;
    }
  }

  res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid token format.' });
}

/**
 * Optional auth — attaches user if token is present, continues either way.
 * Use on public endpoints that have optional personalisation.
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
      const payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;
      req.user = {
        user_id: payload.user_id,
        wallet_address: payload.wallet_address,
        is_agent: payload.is_agent,
        agent_id: payload.agent_id,
      };
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

/**
 * Issue a JWT for a user (called at login / wallet connect).
 */
export function issueJwt(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      user_id: user.user_id,
      wallet_address: user.wallet_address,
      is_agent: user.is_agent,
      agent_id: user.agent_id,
    } satisfies JwtPayload,
    config.auth.jwtSecret,
    { expiresIn: '7d' },
  );
}