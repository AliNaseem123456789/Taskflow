// controllers/authController.js
import bcrypt from "bcryptjs";
import { supabase } from "../config/supabase.js";
import {
  createSession,
  rotateSession,
  revokeSession,
  revokeAllUserSessions,
  findSessionByRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  verifyToken,
} from "../utils/session.js";
import { safeTz, dbDate } from "../utils/time.js";

const USER_FIELDS = "id, email, name, role, timezone";

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  timezone: user.timezone || "UTC",
});

// The browser sends its timezone on signup/login; keep the account in sync.
const syncTimezone = async (user, timezone) => {
  if (!timezone) return user;
  const tz = safeTz(timezone);
  if (tz === user.timezone) return user;
  await supabase.from("users").update({ timezone: tz }).eq("id", user.id);
  return { ...user, timezone: tz };
};

/* ------------------------------------------------------------------ */
/* POST /api/auth/signup                                               */
/* ------------------------------------------------------------------ */

export const signup = async (req, res) => {
  const { email, password, name, timezone } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  if (password.length < 8)
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });

  try {
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser)
      return res.status(409).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from("users")
      .insert([
        { email, password: hashedPassword, name, role: "user", timezone: safeTz(timezone) },
      ])
      .select(USER_FIELDS)
      .single();

    if (error) {
      // unique violation: someone registered this email between the check
      // above and this insert
      if (error.code === "23505")
        return res.status(409).json({ error: "User already exists" });
      throw error;
    }

    const { accessToken, refreshToken, sessionId } = await createSession(
      user,
      req
    );
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      message: "Signup successful",
      accessToken,
      sessionId,
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/auth/login                                                */
/* ------------------------------------------------------------------ */

export const login = async (req, res) => {
  const { email, password, timezone } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  try {
    const { data: found } = await supabase
      .from("users")
      .select(`${USER_FIELDS}, password`)
      .eq("email", email)
      .maybeSingle();

    // Compare against a dummy hash when the user doesn't exist so the
    // response time doesn't leak which emails are registered.
    const hash =
      found?.password ||
      "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.6Zt1hqZ0Q8dQJ2Yb0m0P0m0P0m0P";

    const isValid = await bcrypt.compare(password, hash);

    if (!found || !isValid)
      return res.status(401).json({ error: "Invalid credentials" });

    const user = await syncTimezone(found, timezone);

    const { accessToken, refreshToken, sessionId } = await createSession(
      user,
      req
    );
    setRefreshCookie(res, refreshToken);

    res.status(200).json({
      message: "Login successful",
      accessToken,
      sessionId,
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const refresh = async (req, res) => {
  const token = readRefreshCookie(req);

  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    if (payload.type !== "refresh") {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Wrong token type" });
    }

    const session = await findSessionByRefreshToken(token);

    if (!session) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Session not found" });
    }

    // Replay of an already-rotated token.
    if (session.refresh_token_used) {
      // Rotated a few seconds ago: most likely two tabs refreshed at once.
      // The browser already has the new cookie, so just ask it to retry.
      const rotatedAgo = Date.now() - (dbDate(session.revoked_at)?.getTime() || 0);
      if (rotatedAgo < 30 * 1000)
        return res.status(409).json({ error: "Token already refreshed, retry" });

      // Otherwise assume the token was stolen and kill every live session.
      await revokeAllUserSessions(session.user_id, "token_reuse");
      clearRefreshCookie(res);
      return res
        .status(401)
        .json({ error: "Refresh token reuse detected. All sessions revoked." });
    }

    if (!session.is_active) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Session revoked" });
    }

    if (dbDate(session.refresh_token_expires_at) < new Date()) {
      await revokeSession(session.id, "expired");
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Refresh token expired" });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select(USER_FIELDS)
      .eq("id", session.user_id)
      .single();

    if (error || !user) {
      await revokeSession(session.id, "user_missing");
      clearRefreshCookie(res);
      return res.status(401).json({ error: "User no longer exists" });
    }

    const rotated = await rotateSession(session, user, req);
    if (!rotated)
      return res.status(409).json({ error: "Token already refreshed, retry" });

    const { accessToken, refreshToken: newRefreshToken, sessionId } = rotated;

    setRefreshCookie(res, newRefreshToken);

    res.status(200).json({
      message: "Token refreshed",
      accessToken,
      sessionId,
      user: publicUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const logout = async (req, res) => {
  try {
    // Prefer the session the access token belongs to (set by optionalAuthenticate),
    // fall back to whatever the refresh cookie points at.
    let sessionId = req.sessionId || null;

    if (!sessionId) {
      const token = readRefreshCookie(req);
      if (token) {
        const session = await findSessionByRefreshToken(token);
        sessionId = session?.id || null;
      }
    }

    if (sessionId) await revokeSession(sessionId, "logout");

    clearRefreshCookie(res);
    res.status(200).json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const logoutAll = async (req, res) => {
  try {
    const keepCurrent = req.body?.keepCurrent === true;

    await revokeAllUserSessions(
      req.user.id,
      "logout_all",
      keepCurrent ? req.sessionId : null
    );

    if (!keepCurrent) clearRefreshCookie(res);

    res.status(200).json({
      message: keepCurrent
        ? "All other sessions logged out"
        : "All sessions logged out",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const getMe = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select(USER_FIELDS)
      .eq("id", req.user.id)
      .single();

    if (error || !user)
      return res.status(404).json({ error: "User not found" });

    res.status(200).json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const getSessions = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, ip_address, user_agent, country, city, device_fingerprint, " +
          "created_at, last_accessed_at, refresh_token_expires_at"
      )
      .eq("user_id", req.user.id)
      .eq("is_active", true)
      .order("last_accessed_at", { ascending: false });

    if (error) throw error;

    res.status(200).json({
      sessions: data.map((s) => ({
        ...s,
        current: s.id === req.sessionId,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const revokeSessionById = async (req, res) => {
  try {
    const { data: session, error } = await supabase
      .from("sessions")
      .select("id, user_id")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) throw error;
    if (!session || session.user_id !== req.user.id)
      return res.status(404).json({ error: "Session not found" });

    await revokeSession(session.id, "revoked_by_user");

    if (session.id === req.sessionId) clearRefreshCookie(res);

    res.status(200).json({ message: "Session revoked" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};