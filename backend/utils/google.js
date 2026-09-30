// utils/google.js — Google sign-in (OAuth) + Calendar REST calls
import jwt from "jsonwebtoken";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const googleEnabled = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);

// `state` proves the callback belongs to the user who clicked "Connect"
export const makeState = (userId) =>
  jwt.sign({ id: userId, purpose: "google" }, process.env.JWT_SECRET, { expiresIn: "10m" });

export const readState = (state) => {
  try {
    const p = jwt.verify(state, process.env.JWT_SECRET);
    return p.purpose === "google" ? p.id : null;
  } catch {
    return null;
  }
};

export const authUrl = (userId) =>
  `${AUTH_URL}?${new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // gives a refresh token
    prompt: "consent",
    state: makeState(userId),
  })}`;

const tokenRequest = async (params) => {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "Google token request failed");
  return data; // { access_token, expires_in, refresh_token? }
};

export const exchangeCode = (code) =>
  tokenRequest({ code, grant_type: "authorization_code", redirect_uri: process.env.GOOGLE_REDIRECT_URI });

export const refreshAccess = (refreshToken) =>
  tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

export const revokeToken = (token) =>
  fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});

const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

// All-day event on the task's due date. Returns the event id.
export const saveEvent = async (accessToken, eventId, task) => {
  const body = {
    summary: `${task.status === "Done" ? "✔ " : ""}${task.title}`,
    description: [task.description, task.blocker ? `Blocked: ${task.blocker}` : null, "Added by Taskflow"]
      .filter(Boolean).join("\n\n"),
    start: { date: task.due_date },
    end: { date: nextDay(task.due_date) },
  };
  const res = await fetch(eventId ? `${CALENDAR}/${eventId}` : CALENDAR, {
    method: eventId ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  // event deleted in Google meanwhile -> make a new one
  if (eventId && (res.status === 404 || res.status === 410)) return saveEvent(accessToken, null, task);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Calendar request failed");
  return data.id;
};

export const deleteEvent = async (accessToken, eventId) => {
  const res = await fetch(`${CALENDAR}/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error("Calendar delete failed");
};
