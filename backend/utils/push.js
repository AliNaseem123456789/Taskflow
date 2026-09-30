// utils/push.js — browser push notifications (Web Push / VAPID)
// Keys come from .env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY). If they're not
// set, a pair is generated once and saved in the app_config table.
import webpush from "web-push";
import { supabase } from "../config/supabase.js";

let keys = null;

const loadKeys = async () => {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const { data } = await supabase.from("app_config").select("value").eq("key", "vapid_keys").maybeSingle();
    if (data) {
      keys = JSON.parse(data.value);
    } else {
      const generated = webpush.generateVAPIDKeys();
      // ignoreDuplicates: if another worker saved first, use theirs
      await supabase.from("app_config")
        .upsert({ key: "vapid_keys", value: JSON.stringify(generated) }, { onConflict: "key", ignoreDuplicates: true });
      const { data: saved } = await supabase.from("app_config").select("value").eq("key", "vapid_keys").single();
      keys = JSON.parse(saved.value);
      console.log("[push] generated browser-push keys (saved in app_config)");
    }
  }
  const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.EMAIL_USER || "admin@example.com"}`;
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return keys;
};

export const getPublicKey = async () => (await loadKeys()).publicKey;

// payload: { title, body, url }. Returns how many devices got it.
export const sendPushToUsers = async (userIds, payload) => {
  if (!userIds.length) return 0;
  try {
    await loadKeys();
  } catch (err) {
    console.error("[push] keys unavailable:", err.message);
    return 0;
  }
  const { data: subs } = await supabase.from("push_subscriptions").select("*").in("user_id", userIds);
  let sent = 0;
  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 }
        );
        sent++;
      } catch (err) {
        // 404/410 = the browser unsubscribed; forget it
        if (err.statusCode === 404 || err.statusCode === 410)
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        else console.error("[push] failed:", err.statusCode || err.message);
      }
    })
  );
  return sent;
};
