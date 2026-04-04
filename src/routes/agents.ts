import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { requireAuth, requireHuman } from '../middleware/auth';
import { validateRequest } from '../middleware/errorHandler';
import * as agentService from '../services/agent';
import type { ListAgentsQuery } from '../types';

const router = Router();

// ─────────────────────────────────────────────────────────
// GET /v1/agents
// ─────────────────────────────────────────────────────────

router.get(
  '/',
  [
    query('sort_by').optional().isIn(['pnl', 'win_rate', 'followers', 'volume']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;
    try {
      const q = req.query as ListAgentsQuery;
      const { agents, nextCursor, total } = await agentService.listAgents(q);
      res.json({
        agents: agents.map((a) => ({
          agent_id: a.id,
          name: a.name,
          inft_id: a.inft_id,
          wallet_address: a.wallet_address,
          pnl_wei: a.pnl_wei,
          win_rate: a.win_rate,
          total_bets: a.total_bets,
          followers_count: a.followers_count,
          total_volume_wei: a.total_volume_wei,
          registered_at: Math.floor(a.registered_at.getTime() / 1000),
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
// GET /v1/agents/:id
// ─────────────────────────────────────────────────────────

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await agentService.getAgentProfile(req.params.id);
      res.json({
        agent_id: profile.id,
        name: profile.name,
        description: profile.description,
        wallet_address: profile.wallet_address,
        inft_id: profile.inft_id,
        inft_metadata_uri: profile.inft_metadata_uri,
        og_storage_key: profile.og_storage_key,
        stats: profile.stats,
        followers: profile.followers,
        pnl_history: profile.pnl_history,
        recent_bets: profile.recent_bets,
        registered_at: Math.floor(profile.registered_at.getTime() / 1000),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// POST /v1/agents
// ─────────────────────────────────────────────────────────

const registerValidation = [
  body('name').isString().trim().notEmpty().isLength({ max: 64 }),
  body('description').optional().isString().isLength({ max: 256 }),
  body('wallet_address')
    .isString()
    .matches(/^0x[0-9a-fA-F]{40}$/)
    .withMessage('wallet_address must be a valid EVM address.'),
  body('public_key')
    .isString()
    .matches(/^0x[0-9a-fA-F]{128}$/)
    .withMessage('public_key must be a valid uncompressed EVM public key (130 chars: 0x + 128 hex).'),
  body('strategy_config').optional().isObject(),
  body('inft_metadata_uri').optional().isURL(),
];

router.post(
  '/',
  ...registerValidation,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;
    try {
      const { agent, apiKey } = await agentService.registerAgent(req.body);
      res.status(201).json({
        agent_id: agent.id,
        name: agent.name,
        wallet_address: agent.wallet_address,
        inft_id: agent.inft_id,
        inft_tx_hash: agent.inft_tx_hash,
        inft_metadata_uri: agent.inft_metadata_uri,
        og_storage_key: agent.og_storage_key,
        registry_tx_hash: agent.registry_tx_hash,
        api_key: apiKey,
        registered_at: Math.floor(agent.registered_at.getTime() / 1000),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// POST /v1/agents/:id/follow
// ─────────────────────────────────────────────────────────

const followValidation = [
  body('mode')
    .isIn(['copy', 'short', 'none'])
    .withMessage("mode must be 'copy', 'short', or 'none'."),
  body('copy_fraction')
    .optional()
    .isFloat({ min: 0.01, max: 1.0 })
    .withMessage('copy_fraction must be between 0.01 and 1.0.'),
  body('max_bet_wei')
    .optional()
    .isString()
    .matches(/^\d+$/)
    .withMessage('max_bet_wei must be a decimal string integer.'),
];

router.post(
  '/:id/follow',
  requireAuth,
  requireHuman,
  ...followValidation,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;
    try {
      const user = req.user!;
      const { follow, registryTxHash } = await agentService.followAgent(
        user.user_id,
        user.wallet_address,
        req.params.id,
        req.body,
      );
      res.json({
        follower_id: follow.follower_id,
        agent_id: follow.agent_id,
        mode: follow.mode,
        copy_fraction: parseFloat(follow.copy_fraction.toString()),
        max_bet_wei: follow.max_bet_wei ? follow.max_bet_wei.toString() : null,
        registry_tx_hash: registryTxHash,
        active_since: Math.floor(follow.active_since.getTime() / 1000),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;