import { addClient, removeClient } from "../utils/events.js";

// GET /events?token=<access token>
// Keeps the connection open and streams "task", "notification", "standup"...
export const streamEvents = (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // don't let nginx buffer it
  });
  res.flushHeaders();
  res.write("retry: 5000\n\n");

  const userId = req.user.id;
  addClient(userId, res);

  // comment line every 25s keeps proxies from closing the connection
  const ping = setInterval(() => res.write(": ping\n\n"), 25 * 1000);

  req.on("close", () => {
    clearInterval(ping);
    removeClient(userId, res);
  });
};
