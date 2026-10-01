// Talking to the AI service (/chatbot). It's optional: with no VITE_AI_API_URL,
// or no key on the service, useAI() says "off" and AI buttons stay hidden.
import { useEffect, useState } from "react";
import api from "../api/api";

export const AI_URL = (import.meta.env.VITE_AI_API_URL || "").replace(/\/$/, "");

let status = null; // null = not checked yet, then { on, model }
const waiting = new Set();

const check = () => {
  if (status || !AI_URL) return Promise.resolve(status || { on: false });
  return fetch(`${AI_URL}/api/health`)
    .then((r) => r.json())
    .then((h) => (status = { on: !!h.ai, model: h.model }))
    .catch(() => (status = { on: false }))
    .finally(() => waiting.forEach((fn) => fn(status)));
};

// { on: boolean } — whether to show AI features
export function useAI() {
  const [s, setS] = useState(status || { on: false, checking: !!AI_URL });
  useEffect(() => {
    if (status) return setS(status);
    waiting.add(setS);
    check();
    return () => waiting.delete(setS);
  }, []);
  return s;
}

// POST to the AI service as the signed-in person (the shared client adds the
// token, the chosen company, and refreshes the token when needed).
// options.company: act in a specific company (e.g. a task opened from the inbox)
export async function aiRequest(path, body = {}, options = {}) {
  try {
    const res = await api.post(`${AI_URL}${path}`, body, {
      headers: options.company !== undefined ? { "X-Company-Id": options.company || "" } : undefined,
      withCredentials: false,
    });
    return res.data;
  } catch (err) {
    const message = err.response?.data?.error || err.response?.data?.detail;
    throw new Error(typeof message === "string" ? message : "The AI couldn't answer right now. Try again.");
  }
}
