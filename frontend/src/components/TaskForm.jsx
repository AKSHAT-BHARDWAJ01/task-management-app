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

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape" && !isSaving) onCancel();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSaving, onCancel]);

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
    await onSubmit({
      ...values,
      title: values.title.trim(),
      start_date: values.start_date ? `${values.start_date}T00:00:00` : null,
      due_date: values.due_date ? `${values.due_date}T00:00:00` : null,
      category: values.category.trim() || null,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={!isSaving ? onCancel : undefined}>
      <section
        className="task-modal"
        aria-labelledby="form-heading"
        aria-modal="true"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">{task ? "Update task" : "Create task"}</p>
            <h2 id="form-heading">{task ? "Edit task details" : "Add a new task"}</h2>
          </div>
          <button className="close-button" type="button" onClick={onCancel} disabled={isSaving} aria-label="Close task form">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-field form-field-wide">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" value={values.title} onChange={updateValue} placeholder="What needs to be done?" maxLength="200" disabled={isSaving} required autoFocus />
          </div>

          <div className="form-field form-field-wide">
            <label htmlFor="description">Description <span>(optional)</span></label>
            <textarea id="description" name="description" value={values.description} onChange={updateValue} placeholder="Add helpful context for this task" maxLength="500" rows="4" disabled={isSaving} />
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" value={values.status} onChange={updateValue} disabled={isSaving}>
                <option value="pending">Pending</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="priority">Priority</label>
              <select id="priority" name="priority" value={values.priority} onChange={updateValue} disabled={isSaving}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="start_date">Start date <span>(optional)</span></label>
              <input id="start_date" name="start_date" type="date" value={values.start_date} onChange={updateValue} disabled={isSaving} />
            </div>
            <div className="form-field">
              <label htmlFor="due_date">Due date <span>(optional)</span></label>
              <input id="due_date" name="due_date" type="date" value={values.due_date} onChange={updateValue} disabled={isSaving} />
            </div>
          </div>

          <div className="form-field form-field-wide">
            <label htmlFor="category">Category <span>(optional)</span></label>
            <input id="category" name="category" value={values.category} onChange={updateValue} placeholder="e.g. Work, Personal, Study" maxLength="100" disabled={isSaving} />
          </div>

          {formError && <p className="form-error" role="alert">{formError}</p>}

          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={onCancel} disabled={isSaving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : task ? "Save changes" : "Create task"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
