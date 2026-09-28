import { Response } from 'express';
import crypto from 'crypto';
import prisma from '../database/database';
import { CustomerRequest } from '../middleware/customerAuth';
import {
  razorpay,
  isRazorpayConfigured,
  RAZORPAY_WEBHOOK_SECRET,
  CURRENCY,
  rupeesToPaise,
} from '../config/razorpay';

// Create a Razorpay order for a booking. The booking must already exist
// (created with paymentMethod = 'razorpay' and paymentStatus = 'pending').
// We charge the rental amount + refundable security deposit.
export const createRazorpayOrder = async (req: CustomerRequest, res: Response) => {
  try {
    if (!req.customer?.mobile) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!isRazorpayConfigured()) {
      return res.status(500).json({ error: 'Razorpay is not configured on the server' });
    }

    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId is required' });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.customerPhone !== req.customer.mobile) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Booking is already paid' });
    }

    // The booking was already priced server-side when it was created. Charge
    // that persisted total plus the refundable deposit so accessories and
    // coupon discounts cannot drift between booking and payment.
    const amount = booking.calculatedRate + (booking.securityDeposit || 0);
    const amountPaise = rupeesToPaise(amount);

    const order = await razorpay!.orders.create({
      amount: amountPaise,
      currency: CURRENCY,
      receipt: `booking_${booking.id}`,
      notes: {
        bookingId: booking.id,
        customerPhone: booking.customerPhone,
      },
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        razorpayOrderId: order.id,
        paymentMethod: 'razorpay',
        updatedAt: new Date().toISOString(),
      },
    });

    res.json({
      orderId: order.id,
      amount: amountPaise,
      currency: CURRENCY,
      bookingId: booking.id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
};

// Verify a Razorpay payment after the client checkout completes.
// The client sends razorpay_payment_id, razorpay_order_id, razorpay_signature.
export const verifyRazorpayPayment = async (req: CustomerRequest, res: Response) => {
  try {
    if (!req.customer?.mobile) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, bookingId } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !bookingId) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.customerPhone !== req.customer.mobile) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (booking.razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({ error: 'Order ID mismatch' });
    }

    // Verify signature: HMAC_SHA256(order_id|payment_id, key_secret)
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: 'failed', updatedAt: new Date().toISOString() },
      });
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'paid',
        paymentMethod: 'razorpay',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: 'confirmed',
        updatedAt: new Date().toISOString(),
      },
    });

    res.json({
      message: 'Payment verified successfully',
      bookingId: updated.id,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
};

// Razorpay webhook (server-to-server). Verifies the webhook signature,
// then marks the booking paid. This is the source of truth for payment
// status; the client verify endpoint is for UX only.
export const razorpayWebhook = async (req: CustomerRequest, res: Response) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature || !RAZORPAY_WEBHOOK_SECRET) {
      return res.status(400).json({ error: 'Missing signature or webhook secret' });
    }

    const rawBody = (req as any).rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ error: 'Missing raw webhook body' });
    }
    const expected = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (expected !== signature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body;
    const payment = event?.payload?.payment?.entity;
    if (!payment) {
      return res.json({ status: 'ignored' });
    }

    const orderId = payment.order_id;
    const booking = await prisma.booking.findFirst({
      where: { razorpayOrderId: orderId },
    });
    if (!booking) {
      return res.json({ status: 'no_booking' });
    }

    if (event.event === 'payment.captured' && payment.status === 'captured') {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'paid',
          paymentMethod: 'razorpay',
          razorpayPaymentId: payment.id,
          status: 'confirmed',
          updatedAt: new Date().toISOString(),
        },
      });
    } else if (event.event === 'payment.failed') {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: 'failed', updatedAt: new Date().toISOString() },
      });
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing Razorpay webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
