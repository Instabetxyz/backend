import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/errorHandler';
import * as marketService from '../services/market';

const router = Router();

// ─────────────────────────────────────────────────────────
// POST /v1/stream
// ─────────────────────────────────────────────────────────

const createStreamValidation = [
  body('stream_url')
    .isURL({ require_tld: false })
    .withMessage('stream_url must be a valid URL.')
    .isLength({ max: 500 }),
  body('condition')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ min: 5, max: 1000 })
    .withMessage('condition must be between 5 and 1000 characters.'),
  body('title')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 140 }),
  body('initial_liquidity_wei')
    .optional()
    .isString()
    .matches(/^\d+$/)
    .withMessage('initial_liquidity_wei must be a decimal string integer.'),
];

router.post(
  '/',
  requireAuth,
  ...createStreamValidation,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;

    try {
      const user = req.user!;
      const market = await marketService.createStream(
        req.body,
        user.user_id,
        user.is_agent,
      );

      const halfPool = market.yes_pool_wei;
      const total = (BigInt(market.yes_pool_wei) + BigInt(market.no_pool_wei)).toString();

      res.status(201).json({
        stream_id: market.stream_id,
        market_id: market.id,
        trio_job_id: market.trio_job_id,
        stream_url: market.stream_url,
        condition: market.condition,
        title: market.title,
        status: market.status,
        created_by: market.created_by,
        is_agent_stream: market.is_agent_stream,
        market: {
          yes_pool_wei: halfPool,
          no_pool_wei: halfPool,
          yes_odds: 0.5,
          no_odds: 0.5,
          total_volume_wei: total,
          bettors_count: 0,
        },
        starts_at: Math.floor(market.starts_at.getTime() / 1000),
        ends_at: Math.floor(market.ends_at.getTime() / 1000),
        resolved: false,
        tx_hash: market.tx_hash,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/mock',
  requireAuth,
  ...createStreamValidation,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;

    try {
      const user = req.user!;
      const market = await marketService.createStreamMock(
        req.body,
        user.user_id,
        user.is_agent,
      );

      const halfPool = market.yes_pool_wei;
      const total = (BigInt(market.yes_pool_wei) + BigInt(market.no_pool_wei)).toString();

      res.status(201).json({
        stream_id: market.stream_id,
        market_id: market.id,
        trio_job_id: market.trio_job_id,
        stream_url: market.stream_url,
        condition: market.condition,
        title: market.title,
        status: market.status,
        created_by: market.created_by,
        is_agent_stream: market.is_agent_stream,
        market: {
          yes_pool_wei: halfPool,
          no_pool_wei: halfPool,
          yes_odds: 0.5,
          no_odds: 0.5,
          total_volume_wei: total,
          bettors_count: 0,
        },
        starts_at: Math.floor(market.starts_at.getTime() / 1000),
        ends_at: Math.floor(market.ends_at.getTime() / 1000),
        resolved: false,
        tx_hash: market.tx_hash,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;