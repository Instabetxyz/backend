import { Router } from 'express';

const router = Router();

// GET /v1/markets
router.get('/', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

// GET /v1/markets/:id
router.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

// POST /v1/markets/:id/bet
router.post('/:id/bet', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

export default router;