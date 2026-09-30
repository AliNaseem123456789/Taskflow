// Turn browser notifications on/off for this device
import { apiRequest } from "./api";

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// VAPID public key (base64url) -> Uint8Array for the browser
const toBytes = (base64) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const registration = () => navigator.serviceWorker.register("/sw.js");

export const isPushOn = async () => {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return !!(await reg?.pushManager.getSubscription());
};

export const enablePush = async () => {
  if (!pushSupported()) throw new Error("This browser doesn't support notifications");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked for this site in your browser settings");

  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await apiRequest("/integrations/push/key");
  let sub;
  try {
    sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) }));
  } catch (err) {
    throw new Error(`This browser couldn't turn on notifications (${err.message}). Try Chrome, Edge or Firefox, not a private window.`);
  }
  await apiRequest("/integrations/push/subscribe", "POST", sub.toJSON());
};

export const disablePush = async () => {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await apiRequest("/integrations/push/subscribe", "DELETE", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
};
