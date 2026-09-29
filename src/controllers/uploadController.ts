import { Request, Response } from 'express';
import path from 'path';
import { uploadToR2, downloadFromR2, isR2Configured } from '../config/r2';
import { extForMime } from '../config/idProofUpload';

export const uploadBikeImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    if (!isR2Configured()) {
      return res.status(503).json({ error: 'Image storage is not configured' });
    }

    const ext = extForMime(req.file.mimetype) || path.extname(req.file.originalname) || '.jpg';
    const { key } = await uploadToR2(req.file.buffer, 'bike-images', req.file.mimetype, ext);

    // Frontend renders this via GET /api/images/:key
    res.json({ url: `/api/images/${key}`, key });
  } catch (error) {
    console.error('Error uploading bike image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

// Public image streaming — only serves the bike-images/ prefix so private
// objects (id-proofs/) can never be fetched through this route.
export const serveImage = async (req: Request, res: Response) => {
  try {
    // Route is /api/images/* — wildcard lands in params[0]
    const key = (req.params as any)[0] || '';
    if (!key.startsWith('bike-images/') || key.includes('..')) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const obj = await downloadFromR2(key);
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h
    (obj.Body as any).pipe(res);
  } catch (error: any) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: 'Image not found' });
    }
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to load image' });
  }
};
