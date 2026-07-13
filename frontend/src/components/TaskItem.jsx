const statusLabels = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Completed",
};

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
        </div>
        {task.description && <p>{task.description}</p>}
        <small>Created {createdAt}</small>
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
