import { useCallback, useEffect, useMemo, useState } from "react";

import { taskApi } from "../api/taskApi";
import { AnalyticsView } from "../components/AnalyticsView";
import { CalendarView } from "../components/CalendarView";
import { DashboardStats } from "../components/DashboardStats";
import { Navbar } from "../components/Navbar";
import { SettingsView } from "../components/SettingsView";
import { TaskDetails } from "../components/TaskDetails";
import { TaskFilters } from "../components/TaskFilters";
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

const initialFilters = {
  search: "",
  status: "all",
  priority: "all",
  category: "all",
};

const viewContent = {
  dashboard: {
    eyebrow: "Dashboard",
    title: "Good morning, Akshat",
    description: "Here’s what is happening across your tasks today.",
  },
  tasks: {
    eyebrow: "Pending tasks",
    title: "Your active focus",
    description: "Keep the tasks you are working on front and center.",
  },
  calendar: {
    eyebrow: "Calendar",
    title: "Plan your deadlines",
    description: "Review every task with a due date in one timeline.",
  },
  analytics: {
    eyebrow: "Analytics",
    title: "Task insights & reports",
    description: "Visualize your productivity and export detailed reports.",
  },
  settings: {
    eyebrow: "Settings",
    title: "Manage your workspace",
    description: "Update your profile and task preferences.",
  },
};

function getStats(taskList) {
  return taskList.reduce(
    (stats, task) => {
      stats.total_tasks += 1;
      if (task.status === "pending") stats.pending_count += 1;
      if (task.status === "in-progress") stats.in_progress_count += 1;
      if (task.status === "completed") stats.completed_count += 1;
      if (task.priority === "high") stats.high_priority_count += 1;
      if (task.priority === "medium") stats.medium_priority_count += 1;
      if (task.priority === "low") stats.low_priority_count += 1;
      return stats;
    },
    { ...emptyStats },
  );
}

function filterTasks(taskList, filters) {
  const searchTerm = filters.search.trim().toLowerCase();

  return taskList.filter((task) => {
    const searchableText = `${task.title ?? ""} ${task.description ?? ""}`.toLowerCase();
    const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
    const matchesStatus = filters.status === "all" || task.status === filters.status;
    const matchesPriority = filters.priority === "all" || task.priority === filters.priority;
    const matchesCategory = filters.category === "all" || task.category?.trim() === filters.category;

    return matchesSearch && matchesStatus && matchesPriority && matchesCategory;
  });
}

export function Home({ currentUser, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [filters, setFilters] = useState(initialFilters);
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

  const myTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending" || task.status === "in-progress"),
    [tasks],
  );
  const categories = useMemo(
    () => [...new Set(tasks.map((task) => task.category?.trim()).filter(Boolean))].sort((first, second) => first.localeCompare(second)),
    [tasks],
  );
  const filteredTasks = useMemo(() => filterTasks(tasks, filters), [tasks, filters]);
  const filteredMyTasks = useMemo(() => filterTasks(myTasks, filters), [myTasks, filters]);
  const filteredTaskStats = useMemo(() => getStats(filteredTasks), [filteredTasks]);
  const filteredMyTaskStats = useMemo(() => getStats(filteredMyTasks), [filteredMyTasks]);
  const hasActiveFilters = Boolean(
    filters.search ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.category !== "all",
  );
  const page = viewContent[activeView];
  const firstName = currentUser.name.split(" ")[0];

  function updateFilter(name, value) {
    setFilters((currentFilters) => ({ ...currentFilters, [name]: value }));
  }

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

  function taskWorkspace(taskList, taskStats, totalTaskCount, heading, subheading) {
    return (
      <>
        <DashboardStats stats={taskStats} isLoading={isLoading} isFiltered={hasActiveFilters} />
        <TaskFilters filters={filters} categories={categories} onChange={updateFilter} onClear={() => setFilters(initialFilters)} />
        <div className="dashboard-layout">
          <section className="tasks-section" aria-labelledby="tasks-heading">
            <div className="section-heading">
              <div><p className="eyebrow">{subheading}</p><h2 id="tasks-heading">{heading}</h2></div>
              {!isLoading && <span className="task-count">{hasActiveFilters ? `${taskList.length} of ${totalTaskCount}` : `${taskList.length} total`}</span>}
            </div>
            <TaskList tasks={taskList} isLoading={isLoading} isFiltered={hasActiveFilters} onEdit={openEditModal} onDelete={deleteTask} onComplete={toggleComplete} onSelect={setSelectedTask} deletingId={deletingId} updatingId={updatingId} />
          </section>
          <TaskDetails task={selectedTask} onEdit={openEditModal} onClose={() => setSelectedTask(null)} />
        </div>
      </>
    );
  }

  function renderView() {
    if (activeView === "dashboard") return taskWorkspace(filteredTasks, hasActiveFilters ? filteredTaskStats : stats, tasks.length, "Focus for today", "All tasks");
    if (activeView === "tasks") return taskWorkspace(filteredMyTasks, filteredMyTaskStats, myTasks.length, "My active tasks", "Pending and in progress");
    if (activeView === "calendar") return <CalendarView tasks={tasks} onSelect={setSelectedTask} />;
    if (activeView === "analytics") return <AnalyticsView tasks={tasks} isLoading={isLoading} />;
    return <SettingsView currentUser={currentUser} />;
  }

  return (
    <div className="app-shell">
      <Navbar activeView={activeView} currentUser={currentUser} onNavigate={setActiveView} onLogout={onLogout} />
      <main className={`main-content ${activeView === "analytics" ? "analytics-main-content" : ""}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{page.eyebrow}</p>
            <h1>{activeView === "dashboard" ? `Good morning, ${firstName}` : page.title} {activeView === "dashboard" && <span>✦</span>}</h1>
            <p>{page.description}</p>
          </div>
          {activeView !== "settings" && activeView !== "analytics" && <button className="primary-button add-task-button" type="button" onClick={openCreateModal}><span aria-hidden="true">＋</span> Add task</button>}
        </header>

        {error && <div className="error-banner" role="alert"><span>Unable to complete that action: {error}</span><button type="button" onClick={loadDashboard}>Try again</button></div>}
        {renderView()}
      </main>

      {isModalOpen && <TaskForm task={editingTask} onSubmit={saveTask} onCancel={closeModal} isSaving={isSaving} />}
    </div>
  );
}
