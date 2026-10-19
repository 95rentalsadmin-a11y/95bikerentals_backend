import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { initFirebaseAdmin } from '../config/firebaseAdmin';
import prisma from '../database/database';
import { CustomerRequest } from '../middleware/customerAuth';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';
const DEV_FIREBASE_TOKEN = 'dev-firebase-token';

const formatMobile = (mobile: string) => {
  const digits = mobile.replace(/\D/g, '');
  return digits.startsWith('91') ? digits.slice(2) : digits;
};

const isDevMode = () =>
  process.env.NODE_ENV !== 'production' &&
  !process.env.FIREBASE_SERVICE_ACCOUNT_PATH &&
  !process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

export const verifyCustomerToken = async (req: Request, res: Response) => {
  try {
    const { idToken, mobile } = req.body;
    if (!idToken || !mobile) {
      return res.status(400).json({ error: 'ID token and mobile number are required' });
    }

    const formattedMobile = formatMobile(mobile);
    let phoneNumber = `+91${formattedMobile}`;

    if (isDevMode()) {
      if (idToken !== DEV_FIREBASE_TOKEN) {
        return res.status(401).json({ error: 'Invalid dev token' });
      }
      console.log(`[DEV] Firebase token verified for ${phoneNumber}`);
    } else {
      try {
        const auth = initFirebaseAdmin();
        const decoded = await auth.verifyIdToken(idToken);
        phoneNumber = decoded.phone_number || phoneNumber;
        console.log('[Firebase] Verified token for', phoneNumber);
      } catch (err: any) {
        console.error('[Firebase] Token verification failed:', err.message);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    const customerMobile = phoneNumber.startsWith('+91') ? phoneNumber.slice(3) : phoneNumber.replace(/\D/g, '');
    const token = jwt.sign({ id: customerMobile, mobile: customerMobile, role: 'customer' }, JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({
      token,
      user: { id: customerMobile, mobile: customerMobile, role: 'customer' },
    });
  } catch (error) {
    console.error('Error verifying customer token:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
};

// Saves the customer's Expo push token (sent by the mobile app after login).
export const savePushToken = async (req: CustomerRequest, res: Response) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken')) {
      return res.status(400).json({ error: 'Valid Expo push token is required' });
    }
    const mobile = req.customer?.mobile;
    if (!mobile) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const now = new Date().toISOString();
    await prisma.customer.upsert({
      where: { phone: mobile },
      update: { pushToken, updatedAt: now },
      create: { phone: mobile, pushToken, createdAt: now, updatedAt: now },
    } as any); // Prisma client is regenerated during deployment after this migration.
    res.json({ message: 'Push token saved' });
  } catch (error) {
    console.error('Error saving push token:', error);
    res.status(500).json({ error: 'Failed to save push token' });
  }
};
