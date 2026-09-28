const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || '';
export const DEV_OTP = '123456';

export const isDevMode = () => !FAST2SMS_API_KEY || FAST2SMS_API_KEY === 'your_fast2sms_api_key';

export const formatMobile = (mobile: string) => {
  const digits = mobile.replace(/\D/g, '');
  return digits.startsWith('91') ? digits.slice(2) : digits;
};

export const sendOtp = async (mobile: string, otp: string) => {
  const formattedMobile = formatMobile(mobile);
  const url = 'https://www.fast2sms.com/dev/bulkV2';
  const body = {
    route: 'q',
    message: `Your OTP for 95 Bike Rentals is ${otp}. Do not share it with anyone.`,
    numbers: formattedMobile,
    language: 'english',
    flash: 0,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: FAST2SMS_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};
