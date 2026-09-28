import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth';
import { upload } from '../config/upload';
import {
  loginAdmin,
  getDashboardStats,
  getAllBookings,
  exportBookingsCsv,
  downloadBookingIdProof,
  getAllBikes,
  createBike,
  updateBike,
  updateBikeAvailability,
  updateBookingStatus,
  returnBike,
  getCustomers,
} from '../controllers/adminController';
import { uploadBikeImage } from '../controllers/uploadController';
import {
  getAllAccessories,
  createAccessory,
  updateAccessory,
  deleteAccessory,
} from '../controllers/accessoryController';
import {
  getAllCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from '../controllers/couponController';

const router = Router();

router.post('/login', loginAdmin);
router.get('/dashboard', adminAuth, getDashboardStats);
router.get('/bookings', adminAuth, getAllBookings);
router.get('/bookings/export/csv', adminAuth, exportBookingsCsv);
router.get('/bookings/:id/id-proof', adminAuth, downloadBookingIdProof);
router.get('/bikes', adminAuth, getAllBikes);
router.post('/bikes', adminAuth, createBike);
router.post('/bikes/upload-image', adminAuth, upload.single('image'), uploadBikeImage);
router.patch('/bikes/:id', adminAuth, updateBike);
router.patch('/bikes/:id/availability', adminAuth, updateBikeAvailability);
router.patch('/bookings/:id/status', adminAuth, updateBookingStatus);
router.post('/bookings/:id/return', adminAuth, returnBike);
router.get('/customers', adminAuth, getCustomers);

// Accessories management
router.get('/accessories', adminAuth, getAllAccessories);
router.post('/accessories', adminAuth, createAccessory);
router.patch('/accessories/:id', adminAuth, updateAccessory);
router.delete('/accessories/:id', adminAuth, deleteAccessory);

// Coupons management
router.get('/coupons', adminAuth, getAllCoupons);
router.post('/coupons', adminAuth, createCoupon);
router.patch('/coupons/:id', adminAuth, updateCoupon);
router.delete('/coupons/:id', adminAuth, deleteCoupon);

export default router;
