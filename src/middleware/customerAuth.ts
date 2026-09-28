import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface CustomerRequest extends Request {
  customer?: { id: string; mobile: string; role: string };
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';

// Strict auth: requires a valid customer JWT
export const customerAuth = (req: CustomerRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; mobile: string; role: string };
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.customer = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Optional auth: attaches customer if token present, but does not block
export const optionalCustomerAuth = (req: CustomerRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; mobile: string; role: string };
      if (decoded.role === 'customer') {
        req.customer = decoded;
      }
    } catch {
      // ignore invalid token in optional mode
    }
  }
  next();
};
