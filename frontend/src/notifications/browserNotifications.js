import { canShowBrowserNotification } from "./toastPolicy.js";

const SHOWN_KEY = "taskflow-browser-notes";

export function browserNotificationSupport() {
  return typeof window !== "undefined" && "Notification" in window && window.isSecureContext;
}

export function browserNotificationPermission() {
  if (!browserNotificationSupport()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (!browserNotificationSupport()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function showBrowserNotifications(items, { enabled, onOpen }) {
  if (!canShowBrowserNotification({
    supported: browserNotificationSupport(),
    permission: browserNotificationPermission(),
    enabled,
  })) return;

  const shown = new Set(JSON.parse(sessionStorage.getItem(SHOWN_KEY) || "[]"));
  items.slice(0, 3).forEach((item) => {
    if (shown.has(item.id)) return;
    shown.add(item.id);
    const notice = new Notification(item.title, { body: item.message, tag: `taskflow-${item.id}` });
    notice.onclick = () => {
      window.focus();
      onOpen?.(item);
    };
  });
  sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...shown].slice(-100)));
}
