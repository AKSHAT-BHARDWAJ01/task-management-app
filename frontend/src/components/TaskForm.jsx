import { useEffect, useState } from "react";

const emptyTask = { title: "", description: "", status: "pending" };

export function TaskForm({ task, onSubmit, onCancel, isSaving }) {
  const [values, setValues] = useState(emptyTask);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setValues(
      task
        ? { title: task.title, description: task.description ?? "", status: task.status }
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
    const saved = await onSubmit({ ...values, title: values.title.trim() });
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
