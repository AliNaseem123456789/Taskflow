// A small in-memory rate limit for public (no login) endpoints:
// at most `max` requests per `windowMs` from one IP, per bucket.
// Good enough for one server; put a shared store in front if you run several.
const hits = new Map();

export const rateLimit = (bucket, max = 60, windowMs = 60 * 1000) => (req, res, next) => {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) {
    hits.set(key, { start: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > max) {
    res.set("Retry-After", String(Math.ceil((entry.start + windowMs - now) / 1000)));
    return res.status(429).json({ error: "Too many requests — try again in a minute" });
  }
  next();
};

// forget old entries now and then so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > 10 * 60 * 1000) hits.delete(k);
}, 5 * 60 * 1000).unref();
