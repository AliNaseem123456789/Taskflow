// utils/authTokens.js
// One-time tokens for "verify email" and "reset password" links.
import crypto from "node:crypto";
import { supabase } from "../config/supabase.js";
import { hashToken } from "./session.js";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESET_TTL_MS = 60 * 60 * 1000;       // 1 hour

// Creates a token and returns the raw value to put in the email link.
export const createAuthToken = async (userId, type, ttlMs) => {
  const raw = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("auth_tokens").insert([
    {
      user_id: userId,
      type,
      token_hash: hashToken(raw),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    },
  ]);
  if (error) throw error;
  return raw;
};

// Marks the token used and returns its user_id, or null if it's
// unknown, expired or already used.
export const consumeAuthToken = async (raw, type) => {
  if (!raw) return null;
  const { data } = await supabase
    .from("auth_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(raw))
    .eq("type", type)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id");
  return data?.[0]?.user_id || null;
};

// true if a token of this type was created for the user in the last minute
export const sentRecently = async (userId, type) => {
  const { data } = await supabase
    .from("auth_tokens")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .gt("created_at", new Date(Date.now() - 60 * 1000).toISOString())
    .limit(1);
  return data?.length > 0;
};
