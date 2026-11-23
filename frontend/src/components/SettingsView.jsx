import { useEffect, useState } from "react";

import { apiRoot, notificationApi } from "../api/taskApi";
import {
  browserNotificationPermission,
  browserNotificationSupport,
  requestBrowserNotificationPermission,
} from "../notifications/browserNotifications";
import { useToast } from "../notifications/ToastProvider";
import { isUnifiedSyncEnabled } from "../sync/featureFlags";
import { subscribeWebPush, unsubscribeWebPush, webPushSupported } from "../sync/webPush";
import { applyTheme, readThemeChoice, saveThemeChoice } from "../theme";

const fallbackPreferences = {
  daily_reminders_enabled: true,
  daily_reminder_time: "09:00",
  overdue_reminders_enabled: true,
  browser_notifications_enabled: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  upcoming_reminders_enabled: true,
  due_soon_reminders_enabled: true,
  push_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "07:00",
};

export function SettingsView({ currentUser, onSaved }) {
  const toast = useToast();
  const [compactMode, setCompactMode] = useState(false);
  const [themeChoice, setThemeChoice] = useState(readThemeChoice);
  const [preferences, setPreferences] = useState(fallbackPreferences);
  const [status, setStatus] = useState("loading");
  const supported = browserNotificationSupport();
  const permission = browserNotificationPermission();
  const syncEnabled = isUnifiedSyncEnabled(apiRoot);
  const pushCapable = webPushSupported();

  useEffect(() => {
    let stopped = false;
    notificationApi.preferences()
      .then((saved) => {
        if (!stopped) {
          setPreferences({ ...fallbackPreferences, ...saved });
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!stopped) setStatus("error");
      });
    return () => {
      stopped = true;
    };
  }, []);

  async function save(next) {
    const previous = preferences;
    setPreferences(next);
    try {
      const saved = await notificationApi.savePreferences({
        ...next,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || next.timezone,
      });
      setPreferences({ ...fallbackPreferences, ...saved });
      toast.success("Reminder preferences updated.");
      onSaved?.();
    } catch {
      setPreferences(previous);
      toast.error("Couldn't save your changes.");
    }
  }

  async function enableBrowserNotifications(checked) {
    if (!checked) {
      if (syncEnabled) {
        try { await unsubscribeWebPush(); } catch { /* keep preference update */ }
      }
      save({ ...preferences, browser_notifications_enabled: false });
      return;
    }
    const nextPermission = await requestBrowserNotificationPermission();
    if (nextPermission !== "granted") {
      toast.error(nextPermission === "denied"
        ? "Browser notifications are blocked. Allow them in the browser settings."
        : "Browser notifications are not available here.");
      return;
    }
    if (syncEnabled && pushCapable) {
      const result = await subscribeWebPush();
      if (!result.ok && result.reason !== "server_disabled") {
        toast.error("Couldn't register browser push for this device.");
        return;
      }
      if (result.reason === "server_disabled") {
        toast.info("In-page notifications will work; server Web Push is not configured yet.");
      }
    }
    save({ ...preferences, browser_notifications_enabled: true });
  }

  return (
    <section className="settings-view motion-glass" aria-labelledby="settings-heading" data-gravity>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preferences</p>
          <h2 id="settings-heading">Settings</h2>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card" data-reveal>
          <p className="settings-label">Appearance</p>
          <h3>Theme</h3>
          <p className="settings-note">Light keeps text dark on a pale background. Dark is the current TaskFlow look. System follows this device.</p>
          <div className="theme-choice" role="radiogroup" aria-label="Theme">
            {[
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "System"],
            ].map(([value, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={themeChoice === value}
                className={themeChoice === value ? "is-selected" : ""}
                onClick={() => {
                  saveThemeChoice(value);
                  setThemeChoice(value);
                  applyTheme(value);
                }}
              >
                {text}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card profile-card" data-reveal>
          <p className="settings-label">Profile</p>
          <div className="settings-profile"><span className="settings-avatar">{currentUser.name.charAt(0).toUpperCase()}</span><div><h3>{currentUser.name}</h3><p>Workspace owner</p></div></div>
          <div className="profile-fields"><span><small>Email</small><strong>{currentUser.email}</strong></span><span><small>Workspace</small><strong>Personal workspace</strong></span></div>
          <button className="secondary-button" type="button">Edit profile</button>
        </section>

        <section className="settings-card" data-reveal>
          <p className="settings-label">Reminders</p>
          <h3>Stay ahead of deadlines</h3>
          {status === "loading" && <p className="settings-note">Loading reminder preferences…</p>}
          {status === "error" && <p className="settings-note">Couldn't load reminder preferences. Refresh and try again.</p>}
          {status === "ready" && (
            <>
              <label className="settings-toggle">
                <span><strong>Daily reminder</strong><small>One summary each day, after the time you choose</small></span>
                <input type="checkbox" checked={preferences.daily_reminders_enabled} onChange={(event) => save({ ...preferences, daily_reminders_enabled: event.target.checked })} />
                <i />
              </label>
              <label className="settings-time">
                <span>Reminder time</span>
                <input type="time" value={preferences.daily_reminder_time} onChange={(event) => save({ ...preferences, daily_reminder_time: event.target.value })} />
              </label>
              <label className="settings-toggle">
                <span><strong>Overdue reminders</strong><small>Tell me once when an open task passes its due date</small></span>
                <input type="checkbox" checked={preferences.overdue_reminders_enabled} onChange={(event) => save({ ...preferences, overdue_reminders_enabled: event.target.checked })} />
                <i />
              </label>
              <label className="settings-toggle">
                <span><strong>Upcoming (24h) reminders</strong><small>Warn me the day before a deadline</small></span>
                <input type="checkbox" checked={preferences.upcoming_reminders_enabled !== false} onChange={(event) => save({ ...preferences, upcoming_reminders_enabled: event.target.checked })} />
                <i />
              </label>
              <label className="settings-toggle">
                <span><strong>Due-soon (1h) reminders</strong><small>Warn me about timed deadlines an hour ahead</small></span>
                <input type="checkbox" checked={preferences.due_soon_reminders_enabled !== false} onChange={(event) => save({ ...preferences, due_soon_reminders_enabled: event.target.checked })} />
                <i />
              </label>
              <label className="settings-toggle">
                <span><strong>Quiet hours</strong><small>Defer push delivery overnight</small></span>
                <input type="checkbox" checked={Boolean(preferences.quiet_hours_enabled)} onChange={(event) => save({ ...preferences, quiet_hours_enabled: event.target.checked })} />
                <i />
              </label>
              {preferences.quiet_hours_enabled ? (
                <div className="settings-time-row">
                  <label className="settings-time">
                    <span>Quiet from</span>
                    <input type="time" value={preferences.quiet_hours_start || "22:00"} onChange={(event) => save({ ...preferences, quiet_hours_start: event.target.value })} />
                  </label>
                  <label className="settings-time">
                    <span>Quiet until</span>
                    <input type="time" value={preferences.quiet_hours_end || "07:00"} onChange={(event) => save({ ...preferences, quiet_hours_end: event.target.value })} />
                  </label>
                </div>
              ) : null}
              <label className="settings-toggle">
                <span><strong>Browser notifications</strong><small>{supported ? (syncEnabled ? "Opt in to Web Push when the sync API is available" : "Show reminders in this browser while TaskFlow is open") : "This browser cannot show system notifications"}</small></span>
                <input type="checkbox" checked={preferences.browser_notifications_enabled} disabled={!supported || permission === "denied"} onChange={(event) => enableBrowserNotifications(event.target.checked)} />
                <i />
              </label>
              {permission === "denied" && <p className="settings-note">Notifications are blocked for this site. Allow them in the browser settings, then come back.</p>}
              <p className="settings-note">
                {syncEnabled
                  ? "Server-side reminders run even when TaskFlow is closed. The inbox stays available if you deny browser permission."
                  : "Legacy mode: reminders sync while TaskFlow is open. Enable VITE_ENABLE_UNIFIED_SYNC against a local or staging API for background delivery."}
              </p>
            </>
          )}
          <label className="settings-toggle">
            <span><strong>Compact task cards</strong><small>Show more tasks in the dashboard</small></span>
            <input type="checkbox" checked={compactMode} onChange={(event) => setCompactMode(event.target.checked)} />
            <i />
          </label>
        </section>
      </div>
    </section>
  );
}
