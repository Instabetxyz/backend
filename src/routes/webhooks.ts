import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { getMarketIdByTrioJob, acquireResolutionLock } from '../db/redis';
import { db } from '../db/client';
import * as marketService from '../services/market';
import type { TrioWebhookPayload, MarketRow } from '../types';
import { MarketStatus, ResolutionReason } from '../types';

const router = Router();

// ─────────────────────────────────────────────────────────
// HMAC signature verification
// ─────────────────────────────────────────────────────────

function verifyTrioSignature(req: Request): boolean {
  const signature = req.headers['x-trio-signature'] as string | undefined;
  if (!signature) return false;

  const body =
    typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', config.trio.webhookSecret)
    .update(body)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────
// POST /v1/webhook/trio
// ─────────────────────────────────────────────────────────

router.post(
  '/trio',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. Verify HMAC signature
    if (!verifyTrioSignature(req)) {
      res.status(401).json({
        error: 'INVALID_SIGNATURE',
        message: 'X-Trio-Signature mismatch. Request rejected.',
      });
      return;
    }

    const payload = req.body as TrioWebhookPayload;

    // 2. Respond immediately — Trio will retry on timeout
    //    Resolution processing continues asynchronously after this 200.
    res.status(200).json({ received: true });

    // 3. Async resolution processing
    try {
      await handleTrioEvent(payload);
    } catch (err) {
      // Don't rethrow — the 200 is already sent. Just log.
      console.error('[Webhook/Trio] Processing error:', err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// Event dispatch
// ─────────────────────────────────────────────────────────

async function handleTrioEvent(payload: TrioWebhookPayload): Promise<void> {
  const { job_id, type, triggered } = payload;

  // Resolve on condition match
  if (type === 'watch_triggered' && triggered) {
    await resolveFromTrio(job_id, true, payload.explanation ?? null);
    return;
  }

  // Resolve as NO when Trio reports the job naturally expired
  if (type === 'job_stopped' && payload.stats?.reason === 'max_duration_reached') {
    await resolveFromTrio(job_id, false, null);
    return;
  }

  // Log other event types (job_started, error) without action
  console.log(`[Webhook/Trio] Unhandled event type '${type}' for job ${job_id}`);
}

async function resolveFromTrio(
  jobId: string,
  outcome: boolean,
  explanation: string | null,
): Promise<void> {
  // Look up market from trio job id
  const marketId = await getMarketIdByTrioJob(jobId);
  if (!marketId) {
    console.warn(`[Webhook/Trio] No market found for trio job ${jobId}`);
    return;
  }

  // Acquire lock — prevents double-resolution if Redis expiry fires simultaneously
  const locked = await acquireResolutionLock(marketId);
  if (!locked) {
    console.log(`[Webhook/Trio] Market ${marketId} already being resolved — skipping`);
    return;
  }

  // Load market
  const { rows } = await db.query<MarketRow>(
    'SELECT * FROM markets WHERE id = $1',
    [marketId],
  );
  const market = rows[0];
  if (!market) {
    console.warn(`[Webhook/Trio] Market ${marketId} not found in DB`);
    return;
  }
  if (market.status !== MarketStatus.Active) {
    console.log(`[Webhook/Trio] Market ${marketId} already ${market.status} — skipping`);
    return;
  }

  console.log(
    `[Webhook/Trio] Resolving market ${marketId} — outcome: ${outcome ? 'YES' : 'NO'}`,
  );

  await marketService.resolveMarket({
    marketId,
    onChainMarketId: BigInt(market.on_chain_market_id),
    outcome: outcome,
    reason: outcome ? ResolutionReason.ConditionTriggered : ResolutionReason.MaxDurationReached,
    trioExplanation: explanation,
  });
}

export default router;