import { useMemo, useState } from "react";

const STATUS_LABELS = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Completed",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toLocalDate(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00`);
}

function dateKey(value) {
  return String(value).slice(0, 10);
}

function keyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function dayState(value, dayTasks) {
  if (dayTasks.every((task) => task.status === "completed")) return { className: "done", label: "Completed" };
  return dueState(value);
}

function monthCursor(tasks) {
  const today = new Date();
  const keys = tasks.filter((task) => task.dueDate).map((task) => dateKey(task.dueDate)).sort();
  if (!keys.length) return { year: today.getFullYear(), month: today.getMonth() };

  const todayKey = keyFromDate(today);
  const currentPrefix = todayKey.slice(0, 7);
  if (keys.some((key) => key.startsWith(currentPrefix))) return { year: today.getFullYear(), month: today.getMonth() };

  const chosen = keys.find((key) => key >= todayKey) ?? keys.at(-1);
  const [year, month] = chosen.split("-").map(Number);
  return { year, month: month - 1 };
}

function buildMonth(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function CalendarView({ tasks, onSelect }) {
  const [cursor, setCursor] = useState(null);
  const groupedTasks = useMemo(() => tasks
    .filter((task) => task.dueDate)
    .sort((first, second) => toLocalDate(first.dueDate) - toLocalDate(second.dueDate))
    .reduce((groups, task) => {
      const key = dateKey(task.dueDate);
      groups[key] = [...(groups[key] ?? []), task];
      return groups;
    }, {}), [tasks]);

  const dates = Object.keys(groupedTasks);
  const tasksWithoutDueDate = tasks.filter((task) => !task.dueDate);
  const activeCursor = cursor ?? monthCursor(tasks);
  const monthDates = useMemo(
    () => buildMonth(activeCursor.year, activeCursor.month),
    [activeCursor.month, activeCursor.year],
  );
  const monthName = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(new Date(activeCursor.year, activeCursor.month, 1));
  const todayKey = keyFromDate(new Date());

  function changeMonth(offset) {
    const next = new Date(activeCursor.year, activeCursor.month + offset, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  function showDay(key) {
    const date = toLocalDate(key);
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
    document.getElementById(`calendar-day-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="calendar-view motion-glass" aria-labelledby="calendar-heading" data-gravity>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2 id="calendar-heading">Tasks by due date</h2>
        </div>
        <span className="task-count">{dates.length} scheduled day{dates.length === 1 ? "" : "s"}</span>
      </div>

      <div className="calendar-month" data-reveal>
        <div className="calendar-month-heading">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
          <h3>{monthName}</h3>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid">
          {monthDates.map((date) => {
            const key = keyFromDate(date);
            const dayTasks = groupedTasks[key] ?? [];
            const outside = date.getMonth() !== activeCursor.month;
            const className = [
              "calendar-cell",
              outside ? "is-outside" : "",
              key === todayKey ? "is-today" : "",
              dayTasks.length ? "has-tasks" : "",
            ].filter(Boolean).join(" ");

            if (!dayTasks.length) {
              return <div className={className} key={key}><span>{date.getDate()}</span></div>;
            }

            return (
              <button className={className} key={key} type="button" onClick={() => showDay(key)} aria-label={`${dateLabel(key)}, ${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}`}>
                <span>{date.getDate()}</span>
                <span className="calendar-dots" aria-hidden="true">
                  {dayTasks.slice(0, 3).map((task) => <i key={task.id} className={`priority-${task.priority}`} />)}
                </span>
              </button>
            );
          })}
        </div>
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
          const state = dayState(date, groupedTasks[date]);
          return (
            <section className={`calendar-day calendar-day-${state.className}`} id={`calendar-day-${date}`} key={date} data-reveal>
              <header>
                <div>
                  <h3>{dateLabel(date)}</h3>
                  <span className={`due-indicator due-${state.className}`}>{state.label}</span>
                </div>
                <span>{groupedTasks[date].length} task{groupedTasks[date].length === 1 ? "" : "s"}</span>
              </header>
              <div className="calendar-task-list">
                {groupedTasks[date].map((task) => {
                  const progress = Math.min(100, Math.max(0, task.progress ?? 0));
                  return (
                    <button className="calendar-task" key={task.id} type="button" onClick={() => onSelect(task)}>
                      <span className={`calendar-priority priority-${task.priority}`} aria-hidden="true" />
                      <span className="calendar-task-copy">
                        <strong>{task.title}</strong>
                        <small>{task.category || "Uncategorized"} · {progress}% complete</small>
                        <span className="calendar-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
                      </span>
                      <span className={`status status-${task.status}`}>{STATUS_LABELS[task.status] ?? task.status}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {tasksWithoutDueDate.length > 0 && (
        <section className="unscheduled-tasks" data-reveal>
          <h3>Unscheduled tasks <span>{tasksWithoutDueDate.length}</span></h3>
          <div>{tasksWithoutDueDate.map((task) => <button key={task.id} type="button" onClick={() => onSelect(task)}>{task.title}</button>)}</div>
        </section>
      )}
    </section>
  );
}
