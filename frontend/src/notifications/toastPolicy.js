const DUPLICATE_WINDOW_MS = 1500;

export function shouldShowToast(recent, next, now) {
  return !recent.some((item) => item.message === next.message && item.tone === next.tone && now - item.at < DUPLICATE_WINDOW_MS);
}

export function canShowBrowserNotification({ supported, permission, enabled }) {
  return Boolean(supported && enabled && permission === "granted");
}
