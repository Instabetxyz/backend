import { Router } from 'express';

const router = Router();

// GET /v1/agents
router.get('/', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

// GET /v1/agents/:id
router.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

// POST /v1/agents
router.post('/', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

// POST /v1/agents/:id/follow
router.post('/:id/follow', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

export default router;