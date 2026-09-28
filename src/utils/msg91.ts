const MSG91_AUTHKEY = process.env.MSG91_AUTHKEY || '';
const MSG91_TEMPLATE_ID = process.env.MSG91_TEMPLATE_ID || '';
const MSG91_SENDER_ID = process.env.MSG91_SENDER_ID || '';
const MSG91_ROUTE = process.env.MSG91_ROUTE || '4';
export const DEV_OTP = '123456';

export const isDevMode = () => !MSG91_AUTHKEY || MSG91_AUTHKEY === 'your_msg91_authkey';

export const formatMobile = (mobile: string) => {
  const digits = mobile.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
};

export const callMsg91 = async (url: string) => {
  const res = await fetch(url, { method: 'POST' });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};

export const sendOtpUrl = (mobile: string) => {
  return `https://api.msg91.com/api/v5/otp?authkey=${encodeURIComponent(MSG91_AUTHKEY)}&template_id=${encodeURIComponent(MSG91_TEMPLATE_ID)}&mobile=${mobile}&sender=${encodeURIComponent(MSG91_SENDER_ID)}&route=${encodeURIComponent(MSG91_ROUTE)}`;
};

export const verifyOtpUrl = (mobile: string, otp: string) => {
  return `https://api.msg91.com/api/v5/otp/verify?authkey=${encodeURIComponent(MSG91_AUTHKEY)}&mobile=${mobile}&otp=${encodeURIComponent(otp)}`;
};
