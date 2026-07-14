const navigationItems = [
  { id: "dashboard", icon: "▦", label: "Dashboard" },
  { id: "tasks", icon: "✓", label: "My Tasks" },
  { id: "calendar", icon: "◫", label: "Calendar" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

export function Navbar({ activeView, onNavigate }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#dashboard" aria-label="TaskFlow dashboard">
        <span className="brand-mark" aria-hidden="true">✓</span>
        <span>TaskFlow</span>
      </a>

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
        <span className="profile-avatar" aria-hidden="true">A</span>
        <span>
          <strong>Akshat</strong>
          <small>Workspace owner</small>
        </span>
      </div>
    </aside>
  );
}
