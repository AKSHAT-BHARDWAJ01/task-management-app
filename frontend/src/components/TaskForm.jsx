import { useEffect, useState } from "react";

const emptyTask = {
  title: "",
  description: "",
  status: "pending",
  priority: "medium",
  start_date: "",
  due_date: "",
  category: "",
};

function dateInputValue(value) {
  return value ? value.slice(0, 10) : "";
}

export function TaskForm({ task, onSubmit, onCancel, isSaving }) {
  const [values, setValues] = useState(emptyTask);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setValues(
      task
        ? {
          title: task.title,
          description: task.description ?? "",
          status: task.status,
          priority: task.priority,
          start_date: dateInputValue(task.startDate),
          due_date: dateInputValue(task.dueDate),
          category: task.category ?? "",
        }
        : emptyTask,
    );
    setFormError("");
  }, [task]);

  function updateValue(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!values.title.trim()) {
      setFormError("A task title is required.");
      return;
    }

    setFormError("");
    const saved = await onSubmit({
      ...values,
      title: values.title.trim(),
      start_date: values.start_date ? `${values.start_date}T00:00:00` : null,
      due_date: values.due_date ? `${values.due_date}T00:00:00` : null,
      category: values.category.trim() || null,
    });
    if (saved && !task) setValues(emptyTask);
  }

  return (
    <section className="task-form-card" aria-labelledby="form-heading">
      <div>
        <p className="eyebrow">{task ? "Update task" : "New task"}</p>
        <h2 id="form-heading">{task ? "Edit your task" : "Add a task"}</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="title">Title</label>
        <input
          id="title"
          name="title"
          value={values.title}
          onChange={updateValue}
          placeholder="e.g. Review project requirements"
          maxLength="200"
          disabled={isSaving}
          required
        />

        <label htmlFor="description">Description <span>(optional)</span></label>
        <textarea
          id="description"
          name="description"
          value={values.description}
          onChange={updateValue}
          placeholder="Add a few helpful details"
          maxLength="500"
          rows="4"
          disabled={isSaving}
        />

        <label htmlFor="status">Status</label>
        <select
          id="status"
          name="status"
          value={values.status}
          onChange={updateValue}
          disabled={isSaving}
        >
          <option value="pending">Pending</option>
          <option value="in-progress">In progress</option>
          <option value="completed">Completed</option>
        </select>

        <label htmlFor="priority">Priority</label>
        <select
          id="priority"
          name="priority"
          value={values.priority}
          onChange={updateValue}
          disabled={isSaving}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <div className="date-fields">
          <div>
            <label htmlFor="start_date">Start date <span>(optional)</span></label>
            <input
              id="start_date"
              name="start_date"
              type="date"
              value={values.start_date}
              onChange={updateValue}
              disabled={isSaving}
            />
          </div>
          <div>
            <label htmlFor="due_date">Due date <span>(optional)</span></label>
            <input
              id="due_date"
              name="due_date"
              type="date"
              value={values.due_date}
              onChange={updateValue}
              disabled={isSaving}
            />
          </div>
        </div>

        <label htmlFor="category">Category <span>(optional)</span></label>
        <input
          id="category"
          name="category"
          value={values.category}
          onChange={updateValue}
          placeholder="e.g. Work, Personal, Study"
          maxLength="100"
          disabled={isSaving}
        />

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : task ? "Save changes" : "Add task"}
          </button>
          {task && (
            <button className="text-button" type="button" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
