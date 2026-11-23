/* TaskFlow Web Push service worker — display only; data is refetched by the app. */

self.addEventListener("push", (event) => {
  let payload = { title: "TaskFlow", body: "", data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "TaskFlow", {
      body: payload.body || "",
      data: payload.data || {},
      tag: payload.data?.notification_id ? `tf-${payload.data.notification_id}` : undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification?.data?.link || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.postMessage({ type: "taskflow-notification-click", link });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
      return undefined;
    }),
  );
});
