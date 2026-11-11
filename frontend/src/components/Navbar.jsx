import { InfoTip } from "./collaboration/CollaborationViews";

const navigationItems = [
  { id: "dashboard", icon: "▦", label: "Dashboard" },
  { id: "projects", icon: "▣", label: "Projects" },
  { id: "members", icon: "☺", label: "Team" },
  { id: "analytics", icon: "◎", label: "Analytics" },
  { id: "calendar", icon: "◫", label: "Calendar" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

export function Navbar({ activeView, currentUser, workspaces = [], currentWorkspace, onSwitchWorkspace, onCreateWorkspace, onNavigate, onLogout }) {
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

      <label className="workspace-switcher">
        <span className="workspace-label">Workspace <InfoTip label="About workspaces">A personal workspace is only you. Choose Create team workspace when you want to invite other people.</InfoTip></span>
        <select
          aria-label="Current workspace"
          value={currentWorkspace?.id || ""}
          onChange={(event) => {
            if (event.target.value === "new") onCreateWorkspace();
            else onSwitchWorkspace(Number(event.target.value));
          }}
        >
          {workspaces.length === 0 && <option value="">Loading workspaces…</option>}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
          {workspaces.length > 0 && <option value="new">Create team workspace</option>}
        </select>
      </label>

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
          <small>{currentWorkspace?.name || "Personal tasks"}</small>
        </span>
        <button className="logout-button" type="button" onClick={onLogout} aria-label="Log out">↪</button>
      </div>
    </aside>
  );
}
