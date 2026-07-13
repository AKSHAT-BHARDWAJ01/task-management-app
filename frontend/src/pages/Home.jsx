import { useCallback, useEffect, useState } from "react";

import { taskApi } from "../api/taskApi";
import { Navbar } from "../components/Navbar";
import { DashboardStats } from "../components/DashboardStats";
import { TaskForm } from "../components/TaskForm";
import { TaskList } from "../components/TaskList";

const emptyStats = {
  total_tasks: 0,
  pending_count: 0,
  in_progress_count: 0,
  completed_count: 0,
  high_priority_count: 0,
  medium_priority_count: 0,
  low_priority_count: 0,
};

export function Home() {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskList, taskStats] = await Promise.all([taskApi.getAll(), taskApi.getStats()]);
      setTasks(taskList);
      setStats(taskStats);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function saveTask(values) {
    setIsSaving(true);
    try {
      if (editingTask) {
        await taskApi.update(editingTask.id, values);
        setEditingTask(null);
      } else {
        await taskApi.create(values);
      }
      await loadDashboard();
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
      if (editingTask?.id === id) setEditingTask(null);
      await loadDashboard();
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

        <DashboardStats stats={stats} isLoading={isLoading} />

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
              <button type="button" onClick={loadDashboard}>Try again</button>
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
