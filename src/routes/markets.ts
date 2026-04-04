import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/errorHandler';
import * as marketService from '../services/market';
import type { ListMarketsQuery } from '../types';

const router = Router();

// ─────────────────────────────────────────────────────────
// GET /v1/markets
// ─────────────────────────────────────────────────────────

router.get(
  '/',
  [
    query('status').optional().isIn(['active', 'resolved', 'all']),
    query('agent_only').optional().isIn(['true', 'false']),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;
    try {
      const q = req.query as ListMarketsQuery;
      const { markets, nextCursor, total } = await marketService.listMarkets(q);

      res.json({
        markets: markets.map((m) => ({
          market_id: m.id,
          stream_id: m.stream_id,
          title: m.title,
          condition: m.condition,
          stream_url: m.stream_url,
          status: m.status,
          created_by: m.created_by,
          is_agent_stream: m.is_agent_stream,
          yes_odds: Number(m.yes_pool_wei) === 0 ? 0.5
            : Number(m.no_pool_wei) / (Number(m.yes_pool_wei) + Number(m.no_pool_wei)),
          no_odds: Number(m.yes_pool_wei) === 0 ? 0.5
            : Number(m.yes_pool_wei) / (Number(m.yes_pool_wei) + Number(m.no_pool_wei)),
          yes_pool_wei: m.yes_pool_wei.toString(),
          no_pool_wei: m.no_pool_wei.toString(),
          total_volume_wei: (BigInt(m.yes_pool_wei) + BigInt(m.no_pool_wei)).toString(),
          starts_at: Math.floor(m.starts_at.getTime() / 1000),
          ends_at: Math.floor(m.ends_at.getTime() / 1000),
          seconds_remaining: Math.max(0, Math.floor((m.ends_at.getTime() - Date.now()) / 1000)),
        })),
        next_cursor: nextCursor,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// GET /v1/markets/:id
// ─────────────────────────────────────────────────────────

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { market, agentPositions, recentBets } =
        await marketService.getMarketById(req.params.id);

      res.json({
        market_id: market.id,
        stream_id: market.stream_id,
        stream_url: market.stream_url,
        title: market.title,
        condition: market.condition,
        status: market.status,
        outcome: market.outcome ?? null,
        resolution_reason: market.resolution_reason ?? null,
        trio_explanation: market.trio_explanation ?? null,
        resolved_at: market.resolved_at
          ? Math.floor(market.resolved_at.getTime() / 1000)
          : null,
        resolve_tx_hash: market.resolve_tx_hash ?? null,
        yes_odds: Number(market.no_pool_wei) / (Number(market.yes_pool_wei) + Number(market.no_pool_wei)) || 0.5,
        no_odds: Number(market.yes_pool_wei) / (Number(market.yes_pool_wei) + Number(market.no_pool_wei)) || 0.5,
        yes_pool_wei: market.yes_pool_wei.toString(),
        no_pool_wei: market.no_pool_wei.toString(),
        total_volume_wei: (BigInt(market.yes_pool_wei) + BigInt(market.no_pool_wei)).toString(),
        starts_at: Math.floor(market.starts_at.getTime() / 1000),
        ends_at: Math.floor(market.ends_at.getTime() / 1000),
        agent_positions: agentPositions,
        recent_bets: recentBets.map((b) => ({
          bet_id: b.id,
          user_id: b.user_id,
          side: b.side,
          amount_wei: b.amount_wei.toString(),
          placed_at: Math.floor(b.placed_at.getTime() / 1000),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// POST /v1/markets/:id/bet
// ─────────────────────────────────────────────────────────

const betValidation = [
  body('side').isIn(['yes', 'no']).withMessage("side must be 'yes' or 'no'."),
  body('amount_wei')
    .isString()
    .matches(/^\d+$/)
    .withMessage('amount_wei must be a decimal string integer.'),
];

router.post(
  '/:id/bet',
  requireAuth,
  ...betValidation,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;
    try {
      const user = req.user!;
      const { bet, updatedOdds, mirroredBets } = await marketService.placeBet(
        req.params.id,
        user.user_id,
        user.wallet_address,
        user.is_agent,
        user.agent_id,
        req.body,
      );

      res.status(201).json({
        bet_id: bet.id,
        market_id: bet.market_id,
        user_id: bet.user_id,
        side: bet.side,
        amount_wei: bet.amount_wei.toString(),
        tx_hash: bet.tx_hash,
        placed_at: Math.floor(bet.placed_at.getTime() / 1000),
        updated_odds: updatedOdds,
        mirrored_bets: mirroredBets.map((b) => ({
          bet_id: b.id,
          user_id: b.user_id,
          side: b.side,
          amount_wei: b.amount_wei.toString(),
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;