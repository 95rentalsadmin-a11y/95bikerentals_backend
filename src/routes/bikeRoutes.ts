import { Router } from 'express';
import { getAllBikes, getBikeById } from '../controllers/bikeController';

const router = Router();

router.get('/', getAllBikes);
router.get('/:id', getBikeById);

export default router;
