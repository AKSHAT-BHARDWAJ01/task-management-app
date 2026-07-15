import { useState } from "react";

export function SettingsView({ currentUser }) {
  const [notifications, setNotifications] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  return (
    <section className="settings-view" aria-labelledby="settings-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preferences</p>
          <h2 id="settings-heading">Settings</h2>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card profile-card">
          <p className="settings-label">Profile</p>
          <div className="settings-profile"><span className="settings-avatar">{currentUser.name.charAt(0).toUpperCase()}</span><div><h3>{currentUser.name}</h3><p>Workspace owner</p></div></div>
          <div className="profile-fields"><span><small>Email</small><strong>{currentUser.email}</strong></span><span><small>Workspace</small><strong>Personal workspace</strong></span></div>
          <button className="secondary-button" type="button">Edit profile</button>
        </section>

        <section className="settings-card">
          <p className="settings-label">Preferences</p>
          <h3>Workspace controls</h3>
          <label className="settings-toggle"><span><strong>Task notifications</strong><small>Receive reminders for due tasks</small></span><input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} /><i /></label>
          <label className="settings-toggle"><span><strong>Compact task cards</strong><small>Show more tasks in the dashboard</small></span><input type="checkbox" checked={compactMode} onChange={(event) => setCompactMode(event.target.checked)} /><i /></label>
        </section>
      </div>
    </section>
  );
}
