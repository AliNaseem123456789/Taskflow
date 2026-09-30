// utils/session.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export const ACCESS_TTL = "15m";
export const REFRESH_TTL = "7d";
export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const COOKIE_NAME = "refreshToken";
const COOKIE_PATH = "/auth"; // must cover /refresh and /logout

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const iso = (ms) => new Date(ms).toISOString();

const signAccessToken = (user, jti) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti, type: "access" },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );

const signRefreshToken = (user, jti) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti, type: "refresh" },
    JWT_SECRET,
    { expiresIn: REFRESH_TTL }
  );

export const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

/**
 * Pull request metadata for the sessions row.
 * `country` assumes Cloudflare in front; swap in a geo-IP lookup otherwise.
 */
const requestContext = (req) => ({
  device_fingerprint: req.get("x-device-fingerprint") || null,
  ip_address: req.ip || null,
  user_agent: req.get("user-agent") || null,
  country: req.get("cf-ipcountry") || null,
  city: null,
});


export const createSession = async (user, req) => {
  const accessTokenJti = crypto.randomUUID();
  const refreshTokenJti = crypto.randomUUID();

  const accessToken = signAccessToken(user, accessTokenJti);
  const refreshToken = signRefreshToken(user, refreshTokenJti);

  const now = Date.now();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert([
      {
        user_id: user.id,
        access_token_jti: accessTokenJti,
        refresh_token_hash: hashToken(refreshToken),
        access_token_expires_at: iso(now + ACCESS_TTL_MS),
        refresh_token_expires_at: iso(now + REFRESH_TTL_MS),
        ...requestContext(req),
        is_active: true,
        last_accessed_at: iso(now),
        request_count: 0,
        refresh_token_used: false,
      },
    ])
    .select("id, created_at")
    .single();

  if (error) throw error;

  return { accessToken, refreshToken, sessionId: session.id };
};

/* ------------------------------------------------------------------ */
/* lookup                                                              */
/* ------------------------------------------------------------------ */

export const findSessionByRefreshToken = async (refreshToken) => {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("refresh_token_hash", hashToken(refreshToken))
    .maybeSingle();

  if (error) throw error;
  return data;
};

export const findSessionByJti = async (jti) => {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, user_id, is_active, access_token_expires_at")
    .eq("access_token_jti", jti)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/* ------------------------------------------------------------------ */
/* revoke                                                              */
/* ------------------------------------------------------------------ */

export const revokeSession = async (sessionId, reason = "logout") => {
  const { error } = await supabase
    .from("sessions")
    .update({
      is_active: false,
      revoked_at: iso(Date.now()),
      revocation_reason: reason,
    })
    .eq("id", sessionId);

  if (error) throw error;
};

export const revokeAllUserSessions = async (
  userId,
  reason = "logout_all",
  exceptSessionId = null
) => {
  let query = supabase
    .from("sessions")
    .update({
      is_active: false,
      revoked_at: iso(Date.now()),
      revocation_reason: reason,
    })
    .eq("user_id", userId)
    .eq("is_active", true);

  if (exceptSessionId) query = query.neq("id", exceptSessionId);

  const { error } = await query;
  if (error) throw error;
};

/* ------------------------------------------------------------------ */
/* rotate                                                              */
/* ------------------------------------------------------------------ */

/**
 * Retire the old session and issue a new one.
 * The old row is kept (refresh_token_used = true) so a replay of the old
 * token is detectable rather than just unknown.
 */
export const rotateSession = async (oldSession, user, req) => {
  const { error } = await supabase
    .from("sessions")
    .update({
      refresh_token_used: true,
      is_active: false,
      revoked_at: iso(Date.now()),
      revocation_reason: "rotated",
    })
    .eq("id", oldSession.id)
    .eq("refresh_token_used", false); // guard: lose the race, rotate nothing

  if (error) throw error;

  return createSession(user, req);
};

export const touchSession = async (sessionId) => {
  await supabase
    .from("sessions")
    .update({ last_accessed_at: iso(Date.now()) })
    .eq("id", sessionId);
};

/* ------------------------------------------------------------------ */
/* cookies                                                             */
/* ------------------------------------------------------------------ */

export const setRefreshCookie = (res, refreshToken) => {
  res.cookie(COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_MS,
  });
};

export const clearRefreshCookie = (res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
  });
};

export const readRefreshCookie = (req) =>
  req.cookies?.[COOKIE_NAME] || req.body?.refreshToken || null;