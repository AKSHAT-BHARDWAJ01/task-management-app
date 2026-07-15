function toLocalDate(value) {
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

function dateKey(value) {
  return value.slice(0, 10);
}

function dateLabel(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(toLocalDate(value));
}

function dueState(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const difference = Math.round((toLocalDate(value) - today) / 86_400_000);

  if (difference < 0) return { className: "overdue", label: "Overdue" };
  if (difference === 0) return { className: "today", label: "Due today" };
  if (difference <= 3) return { className: "soon", label: `Due in ${difference} day${difference === 1 ? "" : "s"}` };
  return { className: "future", label: "Upcoming" };
}

export function CalendarView({ tasks, onSelect }) {
  const groupedTasks = tasks
    .filter((task) => task.dueDate)
    .sort((first, second) => new Date(first.dueDate) - new Date(second.dueDate))
    .reduce((groups, task) => {
      const key = dateKey(task.dueDate);
      groups[key] = [...(groups[key] ?? []), task];
      return groups;
    }, {});

  const dates = Object.keys(groupedTasks);
  const tasksWithoutDueDate = tasks.filter((task) => !task.dueDate);

  return (
    <section className="calendar-view" aria-labelledby="calendar-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2 id="calendar-heading">Tasks by due date</h2>
        </div>
        <span className="task-count">{dates.length} scheduled days</span>
      </div>

      {!dates.length && (
        <div className="state-card empty-state">
          <span aria-hidden="true">◫</span>
          <h3>No due dates yet</h3>
          <p>Add a due date to a task and it will appear on this calendar.</p>
        </div>
      )}

      <div className="calendar-groups">
        {dates.map((date) => {
          const state = dueState(date);
          return (
            <section className="calendar-day" key={date}>
              <header>
                <div>
                  <h3>{dateLabel(date)}</h3>
                  <span className={`due-indicator due-${state.className}`}>{state.label}</span>
                </div>
                <span>{groupedTasks[date].length} task{groupedTasks[date].length === 1 ? "" : "s"}</span>
              </header>
              <div className="calendar-task-list">
                {groupedTasks[date].map((task) => (
                  <button className="calendar-task" key={task.id} type="button" onClick={() => onSelect(task)}>
                    <span className={`calendar-priority priority-${task.priority}`} />
                    <span><strong>{task.title}</strong><small>{task.category || "Uncategorized"} · {task.progress ?? 0}% complete</small></span>
                    <span className={`status status-${task.status}`}>{task.status}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {tasksWithoutDueDate.length > 0 && (
        <section className="unscheduled-tasks">
          <h3>Unscheduled tasks <span>{tasksWithoutDueDate.length}</span></h3>
          <div>{tasksWithoutDueDate.map((task) => <button key={task.id} type="button" onClick={() => onSelect(task)}>{task.title}</button>)}</div>
        </section>
      )}
    </section>
  );
}
