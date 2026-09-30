import {
  verifyToken,
  findSessionByJti,
  sessionNeedsTouch,
  touchSession,
} from "../utils/session.js";

const readBearer = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

// Checks the access token AND that its session is still active,
// so revoking a session logs that device out straight away.
// Sets req.user (token payload) and req.sessionId.
export async function authenticate(req, res, next) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ error: "No token provided" });

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (payload.type !== "access")
    return res.status(401).json({ error: "Wrong token type" });

  try {
    const session = await findSessionByJti(payload.jti);
    if (!session || !session.is_active)
      return res.status(401).json({ error: "Session revoked" });

    req.user = payload;
    req.sessionId = session.id;

    if (sessionNeedsTouch(session)) touchSession(session.id).catch(() => {});

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Same as authenticate, but never blocks the request.
// Used by /auth/logout so it can still work with an expired token.
export async function optionalAuthenticate(req, res, next) {
  const token = readBearer(req);
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    if (payload.type === "access") {
      const session = await findSessionByJti(payload.jti);
      if (session?.is_active) {
        req.user = payload;
        req.sessionId = session.id;
      }
    }
  } catch {
    // ignore: logout should still clear the cookie
  }
  next();
}
