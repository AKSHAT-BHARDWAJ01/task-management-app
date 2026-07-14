const statusLabels = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Completed",
};

const priorityLabels = {
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
};

function formatDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function TaskItem({ task, onEdit, onDelete, onComplete, onSelect, isDeleting, isUpdating }) {
  const progress = task.progress ?? 0;

  return (
    <article className="task-item" onClick={() => onSelect(task)}>
      <div className="task-card-topline">
        <div className="task-badges">
          <span className={`status status-${task.status}`}>{statusLabels[task.status]}</span>
          <span className={`priority-chip priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
          {task.category && <span className="category-chip">{task.category}</span>}
        </div>
        <button className="more-button" type="button" aria-label={`View ${task.title}`} onClick={(event) => { event.stopPropagation(); onSelect(task); }}>⋮</button>
      </div>

      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}

      <div className="progress-heading"><span>Progress</span><strong>{progress}%</strong></div>
      <div className="progress-track" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>

      <div className="task-meta">
        <span>◷ {task.startDate ? `Starts ${formatDate(task.startDate)}` : "No start date"}</span>
        <span>◫ {task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"}</span>
      </div>

      <div className="task-actions" onClick={(event) => event.stopPropagation()}>
        <button className="complete-button" type="button" onClick={() => onComplete(task)} disabled={isUpdating}>
          {isUpdating ? "Updating…" : task.status === "completed" ? "Reopen" : "Complete"}
        </button>
        <button className="icon-button" type="button" onClick={() => onEdit(task)}>Edit</button>
        <button className="icon-button danger-button" type="button" onClick={() => onDelete(task.id)} disabled={isDeleting}>{isDeleting ? "Deleting…" : "Delete"}</button>
      </div>
    </article>
  );
}
