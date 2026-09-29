import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AdminRequest extends Request {
  admin?: { id: string; username: string; role: string };
}

export const adminAuth = (req: AdminRequest, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV !== 'production' && process.env.LOCAL_AUTH_BYPASS === 'true' && req.headers['x-local-admin-bypass'] === 'true') {
    req.admin = { id: 'local-admin', username: 'admin', role: 'admin' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'dev-only-secret';

  try {
    const decoded = jwt.verify(token, secret) as { id: string; username: string; role: string };
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
