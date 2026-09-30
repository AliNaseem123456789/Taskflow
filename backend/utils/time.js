// utils/time.js
// Small date helpers that work in a user's own timezone instead of the
// server's clock. Dates are plain "YYYY-MM-DD" strings, like tasks.date_logged.

export const DEFAULT_TZ = "UTC";

export const safeTz = (tz) => {
  if (!tz) return DEFAULT_TZ;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
};

// "2026-10-01" for right now in the given timezone
export const todayIn = (tz, date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

// "2026-10"
export const monthIn = (tz) => todayIn(tz).slice(0, 7);

// { weekday: "Thu", minutes: 545 } for right now in the given timezone
export const clockIn = (tz, date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz(tz),
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
};

// Day number for a "YYYY-MM-DD" string, so two dates can be subtracted
export const dayNumber = (dateStr) =>
  Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10)) /
  86400000;

// "YYYY-MM-DD" shifted by n days
export const addDays = (dateStr, n) =>
  new Date((dayNumber(dateStr) + n) * 86400000).toISOString().slice(0, 10);

// Last day of a "YYYY-MM" month, as "YYYY-MM-DD"
export const monthRange = (month) => {
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
};

// "08:30 PM" -> 1230
export const parseClock = (text) => {
  const [clock, meridian] = String(text).trim().split(" ");
  let [h, m] = clock.split(":").map(Number);
  if (meridian === "PM" && h !== 12) h += 12;
  if (meridian === "AM" && h === 12) h = 0;
  return h * 60 + (m || 0);
};

// Postgres "timestamp without time zone" values come back without a "Z".
// We always store UTC, so treat them as UTC.
export const dbDate = (value) => {
  if (!value) return null;
  const s = String(value);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
};
