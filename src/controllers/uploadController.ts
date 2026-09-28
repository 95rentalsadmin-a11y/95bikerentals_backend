import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'bikes');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const uploadBikeImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const relativePath = `/uploads/bikes/${req.file.filename}`;
    res.json({ url: relativePath });
  } catch (error) {
    console.error('Error uploading bike image:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};
