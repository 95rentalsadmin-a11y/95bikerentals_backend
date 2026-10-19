import prisma from '../database/database';

// Push notifications via the Expo Push API. Customers register an Expo push
// token from the mobile app; we store it on the Customer row and send a
// notification alongside each SMS lifecycle event.
// No configuration is required — Expo hosts the push service.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const sendPush = async (to: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> => {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, title, body, sound: 'default', data }),
    });
    const json: any = await res.json().catch(() => ({}));
    const status = json?.data?.[0]?.status;
    if (!res.ok || (status && status !== 'ok')) {
      console.error('[PUSH] Expo push error:', json);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[PUSH] Failed to send:', err);
    return false;
  }
};

// Looks up the push token for a customer phone number and sends if present.
const pushToCustomer = async (
  phone: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> => {
  const digits = phone.replace(/\D/g, '');
  const candidates = [phone, `+91${digits.slice(-10)}`, `91${digits.slice(-10)}`, digits.slice(-10)];
  try {
    const customer = await prisma.customer.findFirst({
      where: { phone: { in: candidates } },
      select: { pushToken: true },
    } as any); // Prisma client is regenerated during deployment after this migration.
    const pushToken = (customer as any)?.pushToken as string | undefined;
    if (!pushToken || !pushToken.startsWith('ExponentPushToken')) {
      return false;
    }
    return sendPush(pushToken, title, body, data);
  } catch (err) {
    console.error('[PUSH] Token lookup failed:', err);
    return false;
  }
};

export const sendBookingCreatedPush = async (
  phone: string,
  bookingId: string,
  bikeName: string,
  startDate: string,
  startTime: string
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  return pushToCustomer(
    phone,
    'Booking received',
    `Your booking #${shortId} for ${bikeName} on ${startDate} at ${startTime} has been received. We will confirm shortly.`,
    { bookingId }
  );
};

export const sendBookingConfirmedPush = async (
  phone: string,
  bookingId: string,
  bikeName: string,
  startDate: string,
  startTime: string
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  return pushToCustomer(
    phone,
    'Booking confirmed',
    `Booking #${shortId} for ${bikeName} is confirmed for ${startDate} at ${startTime}. Please carry your original ID proof.`,
    { bookingId }
  );
};

export const sendBookingCancelledPush = async (
  phone: string,
  bookingId: string,
  bikeName: string
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  return pushToCustomer(
    phone,
    'Booking cancelled',
    `Your booking #${shortId} for ${bikeName} has been cancelled. If this was a mistake, please call +91 74101 92695.`,
    { bookingId }
  );
};

export const sendBookingCompletedPush = async (
  phone: string,
  bookingId: string,
  bikeName: string,
  lateCharge: number
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  const lateNote = lateCharge > 0 ? ` Late return charge of ₹${lateCharge} applies.` : '';
  return pushToCustomer(
    phone,
    'Ride completed',
    `Booking #${shortId} for ${bikeName} is completed. Thank you for riding with us!${lateNote}`,
    { bookingId }
  );
};

export const sendPaymentSuccessPush = async (
  phone: string,
  bookingId: string,
  amount: number
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  return pushToCustomer(
    phone,
    'Payment received',
    `Payment of ₹${amount} received for booking #${shortId}. Your booking is confirmed.`,
    { bookingId }
  );
};
