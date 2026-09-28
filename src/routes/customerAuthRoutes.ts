import { Router } from 'express';
import { verifyCustomerToken } from '../controllers/customerAuthController';

const router = Router();

router.post('/verify-token', verifyCustomerToken);

export default router;
