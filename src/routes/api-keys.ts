import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validateRequest } from '../middleware/errorHandler';
import * as apiKeyService from '../services/api-keys';

const router = Router();

const createApiKeyValidation = [
  body('wallet_address')
    .isString()
    .matches(/^0x[0-9a-fA-F]{40}$/)
    .withMessage('wallet_address must be a valid EVM address.'),
];

router.post(
  '/',
  ...createApiKeyValidation,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!validateRequest(req, res)) return;
    try {
      const { wallet_address } = req.body;
      const result = await apiKeyService.createApiKeyForWallet(wallet_address);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
