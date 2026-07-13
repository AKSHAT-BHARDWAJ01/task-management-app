const statCards = [
  { key: "total_tasks", label: "Total tasks", className: "total" },
  { key: "pending_count", label: "Pending", className: "pending" },
  { key: "in_progress_count", label: "In progress", className: "in-progress" },
  { key: "completed_count", label: "Completed", className: "completed" },
];

const priorityBadges = [
  { key: "high_priority_count", label: "High priority", className: "high" },
  { key: "medium_priority_count", label: "Medium priority", className: "medium" },
  { key: "low_priority_count", label: "Low priority", className: "low" },
];

export function DashboardStats({ stats, isLoading }) {
  return (
    <section className="dashboard-stats" aria-labelledby="dashboard-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">At a glance</p>
          <h2 id="dashboard-heading">Dashboard</h2>
        </div>
        <span className="stats-caption">Live task summary</span>
      </div>

      <div className="stats-grid" aria-busy={isLoading}>
        {statCards.map(({ key, label, className }) => (
          <article className={`stat-card stat-${className}`} key={key}>
            <span>{label}</span>
            <strong>{isLoading ? "—" : stats[key]}</strong>
          </article>
        ))}
      </div>

      <div className="priority-stats" aria-label="Tasks by priority">
        <span className="priority-label">Priority</span>
        {priorityBadges.map(({ key, label, className }) => (
          <span className={`priority-badge priority-${className}`} key={key}>
            {label}: <strong>{isLoading ? "—" : stats[key]}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}
