// utils/sms.js — text messages through Twilio's REST API
export const smsEnabled = () =>
  !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

// Phone numbers must be in international format: +923001234567
export const isPhone = (value) => /^\+[1-9]\d{7,14}$/.test(String(value || ""));

// Returns true/false. Never throws.
export const sendSms = async (to, body) => {
  if (!smsEnabled() || !isPhone(to)) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER, Body: body.slice(0, 1500) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error("SMS failed:", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("SMS failed:", err.message);
    return false;
  }
};
