import { apiRoot, devicesApi } from "../api/taskApi";
import { isUnifiedSyncEnabled } from "./featureFlags";

const DEVICE_ID_KEY = "taskflow-web-push-device-id";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function webPushSupported() {
  return (
    typeof window !== "undefined"
    && window.isSecureContext
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
  );
}

export function getOrCreateWebDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id || id.length < 8) {
    id = `web-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function registerServiceWorker() {
  if (!webPushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function subscribeWebPush() {
  if (!isUnifiedSyncEnabled(apiRoot) || !webPushSupported()) {
    return { ok: false, reason: "unavailable" };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: permission };
  }

  const config = await devicesApi.webPushConfig();
  if (!config?.enabled || !config.public_key) {
    return { ok: false, reason: "server_disabled" };
  }

  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.public_key),
    });
  }

  const json = subscription.toJSON();
  await devicesApi.registerPushToken({
    device_id: getOrCreateWebDeviceId(),
    platform: "web",
    provider: "webpush",
    token: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return { ok: true };
}

export async function unsubscribeWebPush() {
  if (!webPushSupported()) return { ok: false, reason: "unavailable" };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) await subscription.unsubscribe();
  try {
    await devicesApi.unregisterPushToken(getOrCreateWebDeviceId());
  } catch {
    // Local unsubscribe still succeeded.
  }
  return { ok: true };
}
