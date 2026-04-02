import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.middleware';
import { idempotency } from '../../middleware/idempotency.middleware';
import {
  getBalanceHandler,
  topUpHandler,
  spendHandler,
  listTransactionsHandler,
  getReceiptHandler,
} from './stored-value.controller';

const router = Router();

router.get('/transactions/:id/receipt', authenticate, requirePermission('stored-value:read'), getReceiptHandler);
router.get('/:studentId/balance', authenticate, requirePermission('stored-value:read'), getBalanceHandler);
router.post('/:studentId/top-up', authenticate, requirePermission('stored-value:topup'), idempotency, topUpHandler);
router.post('/:studentId/spend', authenticate, requirePermission('stored-value:spend'), idempotency, spendHandler);
router.get('/:studentId/transactions', authenticate, requirePermission('stored-value:read'), listTransactionsHandler);

export default router;
