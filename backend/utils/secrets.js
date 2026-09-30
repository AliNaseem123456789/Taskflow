// utils/secrets.js
// Encrypts tokens we store for users (Slack webhooks, Google/GitHub/Jira
// tokens) so a database leak doesn't hand them out.
// Key: ENCRYPTION_KEY from .env, or JWT_SECRET if that's not set.
// ⚠ If you change the key later, stored tokens can't be read — users reconnect.
import crypto from "node:crypto";

const key = () =>
  crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY || process.env.JWT_SECRET).digest();

export const encrypt = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
};

export const decrypt = (value) => {
  if (!value) return null;
  try {
    const [version, iv, tag, data] = value.split(":");
    if (version !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key or damaged value
  }
};
