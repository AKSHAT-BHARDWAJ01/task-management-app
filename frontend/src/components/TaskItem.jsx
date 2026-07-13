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

export function TaskItem({ task, onEdit, onDelete, isDeleting }) {
  const createdAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(task.createdAt));

  return (
    <article className={`task-item task-${task.status}`}>
      <div className="task-content">
        <div className="task-heading">
          <h3>{task.title}</h3>
          <span className={`status status-${task.status}`}>{statusLabels[task.status]}</span>
          <span className={`priority-chip priority-${task.priority}`}>
            {priorityLabels[task.priority]}
          </span>
        </div>
        {task.description && <p>{task.description}</p>}
        <div className="task-meta">
          {task.category && <span>{task.category}</span>}
          {task.startDate && <span>Starts {formatDate(task.startDate)}</span>}
          {task.dueDate && <span>Due {formatDate(task.dueDate)}</span>}
          <span>Created {createdAt}</span>
        </div>
      </div>
      <div className="task-actions" aria-label={`Actions for ${task.title}`}>
        <button className="icon-button" type="button" onClick={() => onEdit(task)}>
          Edit
        </button>
        <button
          className="icon-button danger-button"
          type="button"
          onClick={() => onDelete(task.id)}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
}
