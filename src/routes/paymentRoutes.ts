import { Router } from 'express';
import { customerAuth } from '../middleware/customerAuth';
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  razorpayWebhook,
} from '../controllers/paymentController';

const router = Router();

// Webhook is called by Razorpay servers; no customer JWT, signature-verified instead.
// express.json() with raw body is needed for signature verification — handled in server.ts.
router.post('/razorpay/webhook', razorpayWebhook);

// Customer-initiated payment flow
router.post('/razorpay/order', customerAuth, createRazorpayOrder);
router.post('/razorpay/verify', customerAuth, verifyRazorpayPayment);

export default router;
