import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// Cloudflare R2 is S3-compatible. We use the AWS S3 client pointed at the
// R2 endpoint. All uploads go to a single bucket; the key is namespaced by
// purpose (e.g. "id-proofs/...").
//
// Required env vars:
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

export const isR2Configured = (): boolean =>
  Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

const s3Client = isR2Configured()
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

export interface UploadResult {
  key: string;
}

export const downloadFromR2 = async (key: string) => {
  if (!s3Client) {
    throw new Error('R2 storage is not configured');
  }
  return s3Client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
};

// Upload a buffer to R2 under the given prefix. Returns only the private key.
export const uploadToR2 = async (
  buffer: Buffer,
  prefix: string,
  mimeType: string,
  ext: string
): Promise<UploadResult> => {
  if (!s3Client) {
    throw new Error('R2 storage is not configured');
  }

  const randomName = crypto.randomBytes(16).toString('hex');
  const key = `${prefix}/${randomName}${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return { key };
};
