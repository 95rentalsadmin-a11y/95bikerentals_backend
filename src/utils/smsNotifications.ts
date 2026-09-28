import prisma from '../database/database';

// SMS notifications via MSG91. Uses the OTP/send API with a DLT-approved
// template. In dev mode (no MSG91_AUTHKEY), messages are logged only.
//
// Required env vars:
//   MSG91_AUTHKEY
//   MSG91_SENDER_ID       (6-char sender ID, e.g. "95BIKR")
//   MSG91_ROUTE            (default "4")
// For transactional SMS you may also set:
//   MSG91_SMS_TEMPLATE_ID  (DLT template ID for the message body)

const MSG91_AUTHKEY = process.env.MSG91_AUTHKEY || '';
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || '95BIKR';
const MSG91_ROUTE = process.env.MSG91_ROUTE || '4';

export const isSmsConfigured = (): boolean =>
  Boolean(MSG91_AUTHKEY && MSG91_AUTHKEY !== 'your_msg91_authkey');

const formatMobile = (mobile: string): string => {
  const digits = mobile.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
};

// Send a transactional SMS via MSG91's "send SMS" endpoint.
// MSG91 supports variable substitution in DLT templates via {var} placeholders.
const sendSms = async (mobile: string, message: string): Promise<boolean> => {
  const formattedMobile = formatMobile(mobile);

  if (!isSmsConfigured()) {
    console.log(`[DEV SMS] To: +${formattedMobile} | Message: ${message}`);
    return true;
  }

  try {
    const url = `https://api.msg91.com/api/v2/sendsms`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authkey: MSG91_AUTHKEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: MSG91_SENDER_ID,
        route: MSG91_ROUTE,
        country: '91',
        sms: [
          {
            message,
            to: [formattedMobile],
          },
        ],
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[SMS] MSG91 error:', data);
      return false;
    }
    console.log(`[SMS] Sent to +${formattedMobile}: ${message}`);
    return true;
  } catch (err) {
    console.error('[SMS] Failed to send:', err);
    return false;
  }
};

// Notification: booking created (pending confirmation)
export const sendBookingCreatedSms = async (
  mobile: string,
  bookingId: string,
  bikeName: string,
  startDate: string,
  startTime: string
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  const message = `95BikeRentals: Your booking #${shortId} for ${bikeName} on ${startDate} at ${startTime} has been received. We will confirm shortly. Track at 95bikerentals.in/my-bookings`;
  return sendSms(mobile, message);
};

// Notification: booking confirmed
export const sendBookingConfirmedSms = async (
  mobile: string,
  bookingId: string,
  bikeName: string,
  startDate: string,
  startTime: string
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  const message = `95BikeRentals: Booking #${shortId} for ${bikeName} is CONFIRMED for ${startDate} at ${startTime}. Please carry your original ID proof. Pickup: 95BikeRentals Office, Nashik. Helpline: +91 74101 92695`;
  return sendSms(mobile, message);
};

// Notification: booking cancelled
export const sendBookingCancelledSms = async (
  mobile: string,
  bookingId: string,
  bikeName: string
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  const message = `95BikeRentals: Your booking #${shortId} for ${bikeName} has been CANCELLED. If this was a mistake, please call +91 74101 92695.`;
  return sendSms(mobile, message);
};

// Notification: booking completed (bike returned)
export const sendBookingCompletedSms = async (
  mobile: string,
  bookingId: string,
  bikeName: string,
  lateCharge: number
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  const lateNote = lateCharge > 0 ? ` Late return charge of Rs.${lateCharge} applies.` : '';
  const message = `95BikeRentals: Booking #${shortId} for ${bikeName} is COMPLETED. Thank you for riding with us!${lateNote} We hope to see you again.`;
  return sendSms(mobile, message);
};

// Notification: payment successful
export const sendPaymentSuccessSms = async (
  mobile: string,
  bookingId: string,
  amount: number
) => {
  const shortId = bookingId.split('-')[0].toUpperCase();
  const message = `95BikeRentals: Payment of Rs.${amount} received for booking #${shortId}. Your booking is confirmed. Thank you!`;
  return sendSms(mobile, message);
};
