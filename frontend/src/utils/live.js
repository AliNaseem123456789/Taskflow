// Live updates from the backend (/events, Server-Sent Events).
// One connection per browser tab; components subscribe with useLiveEvent().
import { useEffect, useRef } from "react";
import api, { BASE_URL, isLoggedIn } from "../api/api";

const EVENTS = ["task", "comment", "notification", "standup", "project", "goal", "team"];
let source = null;
let retryTimer = null;

const connect = () => {
  if (source || !isLoggedIn()) return;
  const token = localStorage.getItem("accessToken");
  source = new EventSource(`${BASE_URL}/events?token=${encodeURIComponent(token)}`);

  EVENTS.forEach((name) =>
    source.addEventListener(name, (e) => {
      let data = {};
      try { data = JSON.parse(e.data); } catch { /* keep {} */ }
      window.dispatchEvent(new CustomEvent(`live:${name}`, { detail: data }));
    })
  );

  // Token expired or server restarted: refresh the login, then reconnect
  source.onerror = () => {
    source.close();
    source = null;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(async () => {
      await api.get("/auth/me").catch(() => {}); // refreshes the access token if needed
      connect();
    }, 3000);
  };
};

export const startLive = () => connect();

export const stopLive = () => {
  clearTimeout(retryTimer);
  source?.close();
  source = null;
};

// Run `handler` whenever one of these live events arrives.
// Several quick events are merged into one call (after `wait` ms).
export function useLiveEvent(names, handler, wait = 400) {
  const saved = useRef(handler);
  saved.current = handler;
  const key = [].concat(names).join(",");

  useEffect(() => {
    let timer;
    const run = (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => saved.current(e.detail), wait);
    };
    const list = key.split(",");
    list.forEach((n) => window.addEventListener(`live:${n}`, run));
    return () => {
      clearTimeout(timer);
      list.forEach((n) => window.removeEventListener(`live:${n}`, run));
    };
  }, [key, wait]);
}

window.addEventListener("app:logout", stopLive);
