import { useCallback, useEffect, useState } from "react";

import { taskApi } from "../api/taskApi";
import { Navbar } from "../components/Navbar";
import { TaskForm } from "../components/TaskForm";
import { TaskList } from "../components/TaskList";

export function Home() {
  const [tasks, setTasks] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      setTasks(await taskApi.getAll());
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function saveTask(values) {
    setIsSaving(true);
    try {
      if (editingTask) {
        const updatedTask = await taskApi.update(editingTask.id, values);
        setTasks((current) => current.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
        setEditingTask(null);
      } else {
        const newTask = await taskApi.create(values);
        setTasks((current) => [...current, newTask]);
      }
      setError("");
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTask(id) {
    if (!window.confirm("Delete this task?")) return;

    setDeletingId(id);
    try {
      await taskApi.remove(id);
      setTasks((current) => current.filter((task) => task.id !== id));
      if (editingTask?.id === id) setEditingTask(null);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Navbar />
      <main className="page-shell">
        <section className="hero">
          <p className="eyebrow">Personal productivity</p>
          <h1>Organize your work, one task at a time.</h1>
          <p>Keep track of what needs attention and mark progress as you go.</p>
        </section>

        <TaskForm
          task={editingTask}
          onSubmit={saveTask}
          onCancel={() => setEditingTask(null)}
          isSaving={isSaving}
        />

        <section className="tasks-section" aria-labelledby="tasks-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your workspace</p>
              <h2 id="tasks-heading">Tasks</h2>
            </div>
            {!isLoading && <span className="task-count">{tasks.length} total</span>}
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <span>Unable to complete that action: {error}</span>
              <button type="button" onClick={loadTasks}>Try again</button>
            </div>
          )}

          <TaskList
            tasks={tasks}
            isLoading={isLoading}
            onEdit={setEditingTask}
            onDelete={deleteTask}
            deletingId={deletingId}
          />
        </section>
      </main>
    </>
  );
}
