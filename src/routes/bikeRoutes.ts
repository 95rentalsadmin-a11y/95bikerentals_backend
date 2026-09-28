import { Router } from 'express';
import { getAllBikes, getBikeById, updateBikeAvailability } from '../controllers/bikeController';

const router = Router();

router.get('/', getAllBikes);
router.get('/:id', getBikeById);
router.patch('/:id/availability', updateBikeAvailability);

export default router;
