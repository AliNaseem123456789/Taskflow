// utils/slack.js — post to a Slack "Incoming Webhook"
// (Slack → Apps → Incoming Webhooks → Add to a channel → copy the URL)
export const isSlackWebhook = (url) =>
  /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(String(url || ""));

// Returns true/false. Never throws.
export const postToSlack = async (webhookUrl, text) => {
  if (!isSlackWebhook(webhookUrl)) return false;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (err) {
    console.error("Slack failed:", err.message);
    return false;
  }
};
