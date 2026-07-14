import { TaskItem } from "./TaskItem";

export function TaskList({ tasks, isLoading, onEdit, onDelete, onComplete, onSelect, deletingId, updatingId }) {
  if (isLoading) return <div className="state-card" role="status">Loading your tasks…</div>;

  if (!tasks.length) {
    return (
      <div className="state-card empty-state">
        <span aria-hidden="true">✦</span>
        <h3>Your workspace is clear</h3>
        <p>Create a task to start organizing your work.</p>
      </div>
    );
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onComplete={onComplete} onSelect={onSelect} isDeleting={deletingId === task.id} isUpdating={updatingId === task.id} />
      ))}
    </div>
  );
}
