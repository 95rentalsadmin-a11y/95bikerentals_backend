import { Router } from 'express';
import { customerAuth } from '../middleware/customerAuth';
import {
  createBooking,
  getBookingById,
  getMyBookings,
  cancelBooking,
  checkAvailability,
  checkAvailabilityAll,
  calculateRate,
} from '../controllers/bookingController';

const router = Router();

// Public: availability + rate preview (no auth needed to browse)
router.post('/check-availability', checkAvailability);
router.post('/check-availability-all', checkAvailabilityAll);
router.post('/calculate-rate', calculateRate);

// Authenticated customer endpoints
router.post('/', customerAuth, createBooking);
router.get('/me', customerAuth, getMyBookings);
router.get('/:id', customerAuth, getBookingById);
router.patch('/:id/cancel', customerAuth, cancelBooking);

export default router;
