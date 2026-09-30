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
import {
  createAuthToken,
  consumeAuthToken,
  sentRecently,
  VERIFY_TTL_MS,
  RESET_TTL_MS,
} from "../utils/authTokens.js";
import { sendEmail, appLink } from "./emailController.js";

const USER_FIELDS = "id, email, name, role, timezone, email_verified";

const publicUser = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  timezone: user.timezone || "UTC",
  email_verified: user.email_verified !== false,
});

const sendVerificationEmail = async (user) => {
  const token = await createAuthToken(user.id, "verify_email", VERIFY_TTL_MS);
  const link = appLink(`/verify-email?token=${token}`);
  return sendEmail(
    user.email,
    "Verify your email",
    `Hi ${user.name || "there"}!\n\nPlease confirm your email address:\n${link}\n\nThis link works for 24 hours.\n\n– MyDones Team`
  );
};

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

    // don't make signup wait for Gmail
    sendVerificationEmail(user).catch((e) =>
      console.error("Verification email failed:", e.message)
    );

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


/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

// PUT /auth/me  { name, timezone }
export const updateMe = async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: "Name can't be empty" });
    if (name.length > 80) return res.status(400).json({ error: "Name is too long" });
    updates.name = name;
  }
  if (req.body.timezone !== undefined) updates.timezone = safeTz(req.body.timezone);
  if (!Object.keys(updates).length)
    return res.status(400).json({ error: "Nothing to update" });

  try {
    const { data: user, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.user.id)
      .select(USER_FIELDS)
      .single();
    if (error) throw error;
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /auth/change-password  { currentPassword, newPassword }
// Logs out every other device.
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: "Both passwords are required" });
  if (newPassword.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });

  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, password")
      .eq("id", req.user.id)
      .single();

    if (!user || !(await bcrypt.compare(currentPassword, user.password)))
      return res.status(400).json({ error: "Current password is wrong" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await supabase.from("users").update({ password: hashed }).eq("id", user.id);
    await revokeAllUserSessions(user.id, "password_changed", req.sessionId);

    res.json({ message: "Password changed. Other devices were logged out." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Forgot / reset password                                             */
/* ------------------------------------------------------------------ */

// POST /auth/forgot-password  { email }
// Always answers the same way so it can't be used to check which emails exist.
export const forgotPassword = async (req, res) => {
  const email = String(req.body.email || "").trim();
  const reply = () =>
    res.json({ message: "If that email has an account, a reset link is on its way." });
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("email", email)
      .maybeSingle();

    if (user && !(await sentRecently(user.id, "reset_password"))) {
      const token = await createAuthToken(user.id, "reset_password", RESET_TTL_MS);
      const link = appLink(`/reset-password?token=${token}`);
      await sendEmail(
        user.email,
        "Reset your password",
        `Hi ${user.name || "there"}!\n\nSomeone asked to reset your password. If it was you, open this link:\n${link}\n\nIt works for 1 hour. If it wasn't you, ignore this email.\n\n– MyDones Team`
      );
    }
    reply();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /auth/reset-password  { token, password }
// Logs out every device.
export const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!password || password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });

  try {
    const userId = await consumeAuthToken(token, "reset_password");
    if (!userId)
      return res.status(400).json({ error: "This reset link is invalid or has expired" });

    const hashed = await bcrypt.hash(password, 10);
    // opening the emailed link also proves they own the address
    await supabase
      .from("users")
      .update({ password: hashed, email_verified: true })
      .eq("id", userId);
    await revokeAllUserSessions(userId, "password_reset");

    res.json({ message: "Password updated. You can log in now." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Email verification                                                  */
/* ------------------------------------------------------------------ */

// POST /auth/send-verification
export const resendVerification = async (req, res) => {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, email, name, email_verified")
      .eq("id", req.user.id)
      .single();

    if (user.email_verified)
      return res.status(400).json({ error: "Your email is already verified" });
    if (await sentRecently(user.id, "verify_email"))
      return res.status(429).json({ error: "Please wait a minute before asking again" });

    const ok = await sendVerificationEmail(user);
    if (!ok) return res.status(500).json({ error: "Email could not be sent" });
    res.json({ message: "Verification email sent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /auth/verify-email  { token }
export const verifyEmail = async (req, res) => {
  try {
    const userId = await consumeAuthToken(req.body.token, "verify_email");
    if (!userId)
      return res.status(400).json({ error: "This link is invalid or has expired" });

    await supabase.from("users").update({ email_verified: true }).eq("id", userId);
    res.json({ message: "Email verified" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
