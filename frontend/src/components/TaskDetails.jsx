function formatDate(value) {
  if (!value) return "Not scheduled";
  const date = value instanceof Date
    ? value
    : new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function dueTiming(value, status) {
  if (!value) return { label: "No due date", className: "future" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const days = Math.round((due - today) / 86_400_000);

  if (status === "completed") {
    return days < 0
      ? { label: `${Math.abs(days)} day${days === -1 ? "" : "s"} after the due date`, className: "overdue" }
      : { label: "Finished on time", className: "future" };
  }
  if (days < 0) return { label: `Overdue by ${Math.abs(days)} day${days === -1 ? "" : "s"}`, className: "overdue" };
  if (days === 0) return { label: "Due today", className: "today" };
  if (days <= 3) return { label: `Due in ${days} day${days === 1 ? "" : "s"}`, className: "soon" };
  return { label: `Due in ${days} days`, className: "future" };
}

export function TaskDetails({ task, onEdit, onClose }) {
  const timing = task ? dueTiming(task.dueDate, task.status) : null;

  return (
    <aside className="task-details motion-glass" aria-label="Task details" data-reveal>
      <div className="details-heading">
        <p className="eyebrow">Task details</p>
        {task && <button className="close-button" type="button" onClick={onClose} aria-label="Close task details">×</button>}
      </div>

      {task ? (
        <>
          <h2>{task.title}</h2>
          <p className="details-description">{task.description || "No description has been added."}</p>
          <div className="details-progress" aria-label={`${task.progress ?? 0}% progress`}><span style={{ width: `${task.progress ?? 0}%` }} /></div>
          <strong className="details-progress-label">{task.progress ?? 0}% progress</strong>
          <dl className="details-list">
            <div><dt>Status</dt><dd>{task.status}</dd></div>
            <div><dt>Priority</dt><dd className={`priority-${task.priority}`}>{task.priority}</dd></div>
            <div><dt>Today</dt><dd>{formatDate(new Date())}</dd></div>
            <div><dt>Due date</dt><dd>{formatDate(task.dueDate)}</dd></div>
            <div><dt>Timing</dt><dd><span className={`due-indicator due-${timing.className}`}>{timing.label}</span></dd></div>
            <div><dt>Category</dt><dd>{task.category || "Uncategorized"}</dd></div>
            <div><dt>Start date</dt><dd>{formatDate(task.startDate)}</dd></div>
          </dl>
          <button className="primary-button details-edit" type="button" onClick={() => onEdit(task)}>Edit task</button>
        </>
      ) : (
        <div className="details-empty"><span aria-hidden="true">☰</span><h3>Select a task</h3><p>Choose a task card to view its full details.</p></div>
      )}
    </aside>
  );
}
