function formatDate(value) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function TaskDetails({ task, onEdit, onClose }) {
  return (
    <aside className="task-details" aria-label="Task details">
      <div className="details-heading">
        <p className="eyebrow">Task details</p>
        {task && <button className="close-button" type="button" onClick={onClose} aria-label="Close task details">×</button>}
      </div>

      {task ? (
        <>
          <h2>{task.title}</h2>
          <p className="details-description">{task.description || "No description has been added."}</p>
          <div className="details-progress"><span style={{ width: `${task.progress ?? 0}%` }} /></div>
          <strong className="details-progress-label">{task.progress ?? 0}% complete</strong>
          <dl className="details-list">
            <div><dt>Status</dt><dd>{task.status}</dd></div>
            <div><dt>Priority</dt><dd>{task.priority}</dd></div>
            <div><dt>Category</dt><dd>{task.category || "Uncategorized"}</dd></div>
            <div><dt>Start date</dt><dd>{formatDate(task.startDate)}</dd></div>
            <div><dt>Due date</dt><dd>{formatDate(task.dueDate)}</dd></div>
          </dl>
          <button className="primary-button details-edit" type="button" onClick={() => onEdit(task)}>Edit task</button>
        </>
      ) : (
        <div className="details-empty"><span aria-hidden="true">☰</span><h3>Select a task</h3><p>Choose a task card to view its full details.</p></div>
      )}
    </aside>
  );
}
