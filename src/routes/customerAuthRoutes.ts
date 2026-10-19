import { Router } from 'express';
import { savePushToken, verifyCustomerToken } from '../controllers/customerAuthController';
import { customerAuth } from '../middleware/customerAuth';

const router = Router();

router.post('/verify-token', verifyCustomerToken);
router.post('/push-token', customerAuth, savePushToken);

export default router;
