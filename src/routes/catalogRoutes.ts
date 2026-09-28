import { Router } from 'express';
import { getAvailableAccessories } from '../controllers/accessoryController';
import { validateCoupon } from '../controllers/couponController';

const router = Router();

// Public endpoints for the customer booking flow
router.get('/accessories', getAvailableAccessories);
router.post('/coupons/validate', validateCoupon);

export default router;
