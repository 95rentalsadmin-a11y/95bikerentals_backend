import { Response } from 'express';
import { CustomerRequest } from '../middleware/customerAuth';
import { uploadToR2, isR2Configured } from '../config/r2';
import { extForMime } from '../config/idProofUpload';

// Upload a customer ID-proof file to Cloudflare R2.
// Requires customer auth; the private object key is later attached to a booking.
export const uploadIdProof = async (req: CustomerRequest, res: Response) => {
  try {
    if (!req.customer?.mobile) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!isR2Configured()) {
      return res.status(500).json({ error: 'File storage is not configured on the server' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = extForMime(req.file.mimetype);
    const { key } = await uploadToR2(
      req.file.buffer,
      'id-proofs',
      req.file.mimetype,
      ext
    );

    // Keep ID proofs private. Store only the object key; admin signed-download
    // support can be added without exposing public document URLs.
    res.status(201).json({ key });
  } catch (error) {
    console.error('Error uploading ID proof:', error);
    res.status(500).json({ error: 'Failed to upload ID proof' });
  }
};
