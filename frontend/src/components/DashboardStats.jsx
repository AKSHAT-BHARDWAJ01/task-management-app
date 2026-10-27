const statCards = [
  { key: "total_tasks", label: "Total tasks", icon: "▦", className: "total", status: "all" },
  { key: "pending_count", label: "Pending", icon: "◷", className: "pending", status: "pending" },
  { key: "in_progress_count", label: "In progress", icon: "↗", className: "in-progress", status: "in-progress" },
  { key: "completed_count", label: "Completed", icon: "✓", className: "completed", status: "completed" },
];

const priorityBadges = [
  { key: "high_priority_count", label: "High", className: "high" },
  { key: "medium_priority_count", label: "Medium", className: "medium" },
  { key: "low_priority_count", label: "Low", className: "low" },
];

export function DashboardStats({ stats, isLoading, isFiltered = false, activeStatus = "all", onSelectStatus }) {
  const total = stats.total_tasks || 0;

  return (
    <section className="dashboard-stats" aria-labelledby="dashboard-heading" data-gravity>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h2 id="dashboard-heading">Your workspace</h2>
        </div>
        <span className="stats-caption"><span className="live-dot" /> {isFiltered ? "Filtered summary" : "Live summary"}</span>
      </div>

      <div className="stats-grid" aria-busy={isLoading}>
        {statCards.map(({ key, label, icon, className, status }) => {
          const value = stats[key] ?? 0;
          const share = key === "total_tasks" || !total ? (key === "total_tasks" ? 100 : 0) : Math.round((value / total) * 100);
          const isActive = activeStatus === status;

          return (
            <button
              className={`stat-card stat-${className} motion-glass ${isActive ? "stat-card-active" : ""}`}
              key={key}
              type="button"
              data-reveal
              aria-pressed={isActive}
              disabled={isLoading}
              onClick={() => onSelectStatus?.(status)}
            >
              <span className="stat-icon" aria-hidden="true">{icon}</span>
              <div>
                <span className="stat-label">{label}</span>
                <strong>{isLoading ? "—" : value}</strong>
                <small>{isLoading ? "Loading…" : isActive ? "Showing these tasks" : `${share}% of this view`}</small>
              </div>
            </button>
          );
        })}
      </div>

      <div className="priority-stats" aria-label="Tasks by priority">
        <span className="priority-label">Priority breakdown</span>
        {priorityBadges.map(({ key, label, className }) => (
          <span className={`priority-badge priority-${className}`} key={key}>
            <span className="priority-dot" aria-hidden="true" />
            {label}: <strong>{isLoading ? "—" : stats[key]}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}
