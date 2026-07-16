const navigationItems = [
  { id: "dashboard", icon: "▦", label: "Dashboard" },
  { id: "tasks", icon: "✓", label: "Pending Tasks" },
  { id: "analytics", icon: "◎", label: "Analytics" },
  { id: "calendar", icon: "◫", label: "Calendar" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

export function Navbar({ activeView, currentUser, onNavigate, onLogout }) {
  const name = currentUser?.name || "Workspace owner";
  return (
    <aside className="sidebar">
      <button
        className="brand"
        type="button"
        onClick={() => onNavigate("dashboard")}
        aria-label="Go to the TaskFlow dashboard"
      >
        <img className="brand-mark" src="/favicon.ico" alt="" />
        <span>TaskFlow</span>
      </button>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigationItems.map((item) => (
          <button
            className={`nav-item ${activeView === item.id ? "nav-item-active" : ""}`}
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-profile">
        <span className="profile-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        <span>
          <strong>{name}</strong>
          <small>Workspace owner</small>
        </span>
        <button className="logout-button" type="button" onClick={onLogout} aria-label="Log out">↪</button>
      </div>
    </aside>
  );
}
