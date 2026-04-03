import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

// ─────────────────────────────────────────────────────────
// Typed application error
// ─────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Common pre-built errors
export const Errors = {
  notFound: (resource: string) =>
    new AppError(404, 'NOT_FOUND', `${resource} not found.`),

  marketClosed: (endedAt: number) =>
    new AppError(409, 'MARKET_CLOSED', 'Betting window has ended.', {
      ended_at: endedAt,
    }),

  slippageExceeded: (would: string, min: string) =>
    new AppError(400, 'SLIPPAGE_EXCEEDED', `Shares received (${would}) below min_shares (${min}).`, {
      shares_would_receive: would,
    }),

  streamInvalid: (reason: string) =>
    new AppError(422, 'STREAM_INVALID', 'Stream URL is not live or unreachable.', {
      trio_validation: { reachable: false, reason },
    }),

  alreadyFollowing: (currentMode: string) =>
    new AppError(409, 'ALREADY_FOLLOWING', "Use mode 'none' to unfollow first, or change mode directly.", {
      current_mode: currentMode,
    }),

  unauthorized: () =>
    new AppError(401, 'UNAUTHORIZED', 'Authentication required.'),

  forbidden: () =>
    new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'),
} as const;

// ─────────────────────────────────────────────────────────
// Validation helper — call at top of route handler
// ─────────────────────────────────────────────────────────

export function validateRequest(req: Request, res: Response): boolean {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: errors.array(),
    });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────
// Global error handler — must be last middleware in app
// ─────────────────────────────────────────────────────────

export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      ...(err.extra ?? {}),
    });
    return;
  }

  // Unexpected errors
  console.error('[Error]', err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  });
}