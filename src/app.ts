import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

import { globalErrorHandler } from './middleware/errorHandler';
import streamsRouter from './routes/streams';
import marketsRouter from './routes/markets';
import agentsRouter from './routes/agents';
import webhooksRouter from './routes/webhooks';

export function createApp(): express.Application {
  const app = express();

  // ── Security & parsing ──────────────────────────────────
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // ── Health check ────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: Math.floor(Date.now() / 1000) });
  });

  // ── API routes ──────────────────────────────────────────
  app.use('/v1/stream', streamsRouter);
  app.use('/v1/markets', marketsRouter);
  app.use('/v1/agents', agentsRouter);
  app.use('/v1/webhook', webhooksRouter);

  // ── Global error handler (must be last) ─────────────────
  app.use(globalErrorHandler);

  return app;
}