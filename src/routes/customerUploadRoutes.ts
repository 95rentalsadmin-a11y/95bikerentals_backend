import { Router } from 'express';
import { customerAuth } from '../middleware/customerAuth';
import { idProofUpload } from '../config/idProofUpload';
import { uploadIdProof } from '../controllers/customerUploadController';

const router = Router();

// Upload an ID-proof file (image or PDF). Requires customer auth.
router.post('/id-proof', customerAuth, idProofUpload.single('file'), uploadIdProof);

export default router;
