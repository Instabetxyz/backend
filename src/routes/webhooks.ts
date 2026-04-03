import { Router } from 'express';

const router = Router();

// POST /v1/webhook/trio
router.post('/trio', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Coming in Phase 2.' });
});

export default router;