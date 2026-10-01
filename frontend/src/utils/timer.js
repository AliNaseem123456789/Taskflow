// The running timer (one per person), shared by the sidebar, task pages and the timesheet.
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./api";

const CHANGED = "timer:changed";
let current; // undefined = not loaded yet

const fetchRunning = () =>
  apiRequest("/time/running", "GET", null, { personal: true })
    .then((r) => { current = r.running; window.dispatchEvent(new Event(CHANGED)); })
    .catch(() => {});

// minutes -> "2h 05m" / "45m"
export const fmtMinutes = (m) => {
  const n = Math.round(m || 0);
  if (n < 60) return `${n}m`;
  return `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m`;
};

// seconds since a timestamp -> "1:02:03"
export const fmtClock = (since, now) => {
  const s = Math.max(0, Math.floor((now - new Date(since)) / 1000));
  const pad = (n) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

// "1:30", "1h 30m", "90m", "1.5" (hours) -> minutes, or null
export const parseDuration = (text) => {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  let m;
  if ((m = t.match(/^(\d+):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/)) && (m[1] || m[2])) return Math.round(Number(m[1] || 0) * 60 + Number(m[2] || 0));
  if ((m = t.match(/^\d+(?:\.\d+)?$/))) return Math.round(Number(t) * 60);
  return null;
};

export function useTimer() {
  const [running, setRunning] = useState(current ?? null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const sync = () => setRunning(current ?? null);
    window.addEventListener(CHANGED, sync);
    if (current === undefined) fetchRunning();
    return () => window.removeEventListener(CHANGED, sync);
  }, []);

  // tick once a second only while something is running
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = useCallback(async (taskId, opts = {}) => {
    const r = await apiRequest("/time/start", "POST", { task_id: taskId || null }, opts);
    current = r.running;
    window.dispatchEvent(new Event(CHANGED));
    return r;
  }, []);

  const stop = useCallback(async () => {
    const r = await apiRequest("/time/stop", "POST", null, { personal: true });
    current = null;
    window.dispatchEvent(new Event(CHANGED));
    return r;
  }, []);

  return { running, now, start, stop, refresh: fetchRunning };
}

// let other views know entries changed (e.g. the timesheet after a stop)
export const onTimerChange = (fn) => {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
};
