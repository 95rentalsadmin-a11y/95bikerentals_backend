import { initializeApp, cert, ServiceAccount, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import path from 'path';
import fs from 'fs';

const getServiceAccount = (): ServiceAccount => {
  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (envPath) {
    const resolvedPath = path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(raw) as ServiceAccount;
  }

  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    const raw = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(raw) as ServiceAccount;
  }

  throw new Error(
    'Missing Firebase service account configuration. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_BASE64 in .env.'
  );
};

export const initFirebaseAdmin = () => {
  if (getApps().length > 0) {
    return getAuth();
  }
  const app = initializeApp({
    credential: cert(getServiceAccount()),
  });
  return getAuth(app);
};
