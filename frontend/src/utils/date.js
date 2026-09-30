// Dates in the user's own timezone. Never use toISOString() for "today":
// it's UTC, so in Pakistan it returns yesterday until 5am.

const pad = (n) => String(n).padStart(2, "0");

// Date object -> "2026-10-01" (local)
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Date object -> "2026-10" (local)
export const localMonth = (d = new Date()) => localDate(d).slice(0, 7);

// "2026-10-01" -> Date at local midnight
export const parseLocalDate = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// "2026-10-01" shifted by n days
export const shiftDate = (s, n) => {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return localDate(d);
};
