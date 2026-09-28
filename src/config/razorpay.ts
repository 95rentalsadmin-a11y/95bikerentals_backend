import Razorpay from 'razorpay';

// Razorpay live credentials. Set in .env:
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET
//   RAZORPAY_WEBHOOK_SECRET  (configured in Razorpay dashboard webhook)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

export const isRazorpayConfigured = (): boolean =>
  Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

export const razorpay = isRazorpayConfigured()
  ? new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    })
  : null;

// Currency is INR for this app.
export const CURRENCY = 'INR';

// Convert rupees to paise (Razorpay expects the smallest currency unit).
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);
