import { TaskItem } from "./TaskItem";

export function TaskList({ tasks, isLoading, onEdit, onDelete, deletingId }) {
  if (isLoading) {
    return <div className="state-card" role="status">Loading your tasks…</div>;
  }

  if (!tasks.length) {
    return (
      <div className="state-card empty-state">
        <span aria-hidden="true">✦</span>
        <h3>No tasks yet</h3>
        <p>Add your first task using the form above.</p>
      </div>
    );
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          isDeleting={deletingId === task.id}
        />
      ))}
    </div>
  );
}
