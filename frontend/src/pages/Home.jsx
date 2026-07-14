import { useCallback, useEffect, useState } from "react";

import { taskApi } from "../api/taskApi";
import { DashboardStats } from "../components/DashboardStats";
import { Navbar } from "../components/Navbar";
import { TaskDetails } from "../components/TaskDetails";
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
  const [activeView, setActiveView] = useState("dashboard");
  const [editingTask, setEditingTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
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

  function openCreateModal() {
    setEditingTask(null);
    setIsModalOpen(true);
  }

  function openEditModal(task) {
    setEditingTask(task);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingTask(null);
  }

  async function saveTask(values) {
    setIsSaving(true);
    try {
      const savedTask = editingTask
        ? await taskApi.update(editingTask.id, values)
        : await taskApi.create(values);
      setSelectedTask(savedTask);
      await loadDashboard();
      setIsModalOpen(false);
      setEditingTask(null);
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
      if (selectedTask?.id === id) setSelectedTask(null);
      await loadDashboard();
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleComplete(task) {
    const isCompleted = task.status === "completed";
    setUpdatingId(task.id);
    try {
      const updatedTask = await taskApi.update(task.id, {
        status: isCompleted ? "pending" : "completed",
        progress: isCompleted && task.progress === 100 ? 0 : isCompleted ? task.progress : 100,
      });
      setSelectedTask(updatedTask);
      await loadDashboard();
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="app-shell">
      <Navbar activeView={activeView} onNavigate={setActiveView} />
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeView === "dashboard" ? "Dashboard" : activeView}</p>
            <h1>Good morning, Akshat <span>✦</span></h1>
            <p>Here’s what is happening across your tasks today.</p>
          </div>
          <button className="primary-button add-task-button" type="button" onClick={openCreateModal}><span aria-hidden="true">＋</span> Add task</button>
        </header>

        {error && <div className="error-banner" role="alert"><span>Unable to complete that action: {error}</span><button type="button" onClick={loadDashboard}>Try again</button></div>}

        <DashboardStats stats={stats} isLoading={isLoading} />

        <div className="dashboard-layout">
          <section className="tasks-section" aria-labelledby="tasks-heading">
            <div className="section-heading">
              <div><p className="eyebrow">My tasks</p><h2 id="tasks-heading">Focus for today</h2></div>
              {!isLoading && <span className="task-count">{tasks.length} total</span>}
            </div>
            <TaskList tasks={tasks} isLoading={isLoading} onEdit={openEditModal} onDelete={deleteTask} onComplete={toggleComplete} onSelect={setSelectedTask} deletingId={deletingId} updatingId={updatingId} />
          </section>
          <TaskDetails task={selectedTask} onEdit={openEditModal} onClose={() => setSelectedTask(null)} />
        </div>
      </main>

      {isModalOpen && <TaskForm task={editingTask} onSubmit={saveTask} onCancel={closeModal} isSaving={isSaving} />}
    </div>
  );
}
