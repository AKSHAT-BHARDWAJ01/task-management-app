import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { notificationApi, taskApi } from "../api/taskApi";
import { AnalyticsView } from "../components/AnalyticsView";
import { HomeNoticePopup } from "../components/HomeNoticePopup";
import { NotificationBell } from "../components/NotificationBell";
import { CalendarView } from "../components/CalendarView";
import { DashboardStats } from "../components/DashboardStats";
import { Navbar } from "../components/Navbar";
import { SettingsView } from "../components/SettingsView";
import { TaskDetails } from "../components/TaskDetails";
import { TaskFilters } from "../components/TaskFilters";
import { TaskForm } from "../components/TaskForm";
import { TaskList } from "../components/TaskList";
import { useGravityNavigation, useMotionSystem } from "../motion/useMotionSystem";
import { showBrowserNotifications } from "../notifications/browserNotifications";
import { useToast } from "../notifications/ToastProvider";

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
    description: "See completion, status, priority, and when tasks were created.",
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
  const mainContentRef = useRef(null);
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
  const [noticeRevision, setNoticeRevision] = useState(0);
  const toast = useToast();

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
  const filteredMyTaskStats = useMemo(() => getStats(filteredMyTasks), [filteredMyTasks]);
  const hasActiveFilters = Boolean(
    filters.search ||
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.category !== "all",
  );
  const page = viewContent[activeView];
  const firstName = currentUser.name.split(" ")[0];
  const navigateWithGravity = useGravityNavigation(mainContentRef, activeView, setActiveView);

  useMotionSystem(mainContentRef, activeView);

  const actionsRef = useRef({});

  const syncReminders = useCallback(async () => {
    try {
      const result = await notificationApi.sync(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const created = (result?.created ?? []).map((item) => ({
        ...item,
        taskId: item.taskId ?? item.task_id ?? null,
      }));
      showBrowserNotifications(created, {
        enabled: Boolean(result?.browser_notifications_enabled),
        onOpen: (item) => {
          const current = actionsRef.current;
          const taskId = item.taskId ?? item.task_id;
          if (item.type === "summary" || !taskId) current.navigateWithGravity("tasks");
          else current.openNotifiedTask(taskId);
        },
      });
      setNoticeRevision((current) => current + 1);
    } catch {
      // Opening the notification panel reports a load error on its own.
    }
  }, []);

  const openNotifiedTask = useCallback((taskId) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      toast.info("That task is no longer available.");
      return;
    }
    setSelectedTask(task);
    if (activeView !== "dashboard") navigateWithGravity("dashboard");
  }, [activeView, navigateWithGravity, tasks, toast]);

  actionsRef.current = { navigateWithGravity, tasks, toast, openNotifiedTask };

  useEffect(() => {
    syncReminders();
    const timer = window.setInterval(syncReminders, 5 * 60 * 1000);
    function onVisible() {
      if (document.visibilityState === "visible") syncReminders();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncReminders]);

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
      toast.success(editingTask ? "Task updated successfully." : "Task created successfully.");
      syncReminders();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      toast.error(editingTask ? "Couldn't save your changes." : "Couldn't create the task. Please try again.");
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
      toast.success("Task deleted successfully.");
      syncReminders();
    } catch (requestError) {
      setError(requestError.message);
      toast.error("Couldn't delete the task. Please try again.");
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
      toast.success(isCompleted ? "Task moved back to pending." : "Task completed! Nice work.");
      syncReminders();
    } catch (requestError) {
      setError(requestError.message);
      toast.error("Couldn't save your changes.");
    } finally {
      setUpdatingId(null);
    }
  }

  function selectStatus(status) {
    setFilters((currentFilters) => ({
      ...currentFilters,
      status: status === "all" || currentFilters.status === status ? "all" : status,
    }));
    document.getElementById("tasks-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function taskWorkspace(taskList, taskStats, totalTaskCount, heading, subheading) {
    const visibleHeading = {
      all: heading,
      pending: "Pending tasks",
      "in-progress": "Tasks in progress",
      completed: "Completed tasks",
    }[filters.status];

    return (
      <>
        <DashboardStats stats={taskStats} isLoading={isLoading} isFiltered={hasActiveFilters} activeStatus={filters.status} onSelectStatus={selectStatus} />
        <TaskFilters filters={filters} categories={categories} onChange={updateFilter} onClear={() => setFilters(initialFilters)} />
        <div className="dashboard-layout">
          <section className="tasks-section motion-glass" aria-labelledby="tasks-heading" data-reveal>
            <div className="section-heading">
              <div><p className="eyebrow">{filters.status === "all" ? subheading : "Filtered by the summary card"}</p><h2 id="tasks-heading">{visibleHeading}</h2></div>
              {!isLoading && <span className="task-count">{hasActiveFilters ? `${taskList.length} of ${totalTaskCount}` : `${taskList.length} total`}</span>}
            </div>
            <TaskList tasks={taskList} isLoading={isLoading} isFiltered={hasActiveFilters} onEdit={openEditModal} onDelete={deleteTask} onComplete={toggleComplete} onSelect={setSelectedTask} deletingId={deletingId} updatingId={updatingId} selectedTaskId={selectedTask?.id} />
          </section>
          <TaskDetails task={selectedTask} onEdit={openEditModal} onClose={() => setSelectedTask(null)} />
        </div>
      </>
    );
  }

  function renderView() {
    const dashboardScope = filterTasks(tasks, { ...filters, status: "all" });
    if (activeView === "dashboard") return taskWorkspace(filteredTasks, filters.search || filters.priority !== "all" || filters.category !== "all" ? getStats(dashboardScope) : stats, tasks.length, "Focus for today", "All tasks");
    if (activeView === "tasks") return taskWorkspace(filteredMyTasks, filteredMyTaskStats, myTasks.length, "My active tasks", "Pending and in progress");
    if (activeView === "calendar") return <CalendarView tasks={tasks} onSelect={setSelectedTask} />;
    if (activeView === "analytics") return <AnalyticsView tasks={tasks} isLoading={isLoading} />;
    return <SettingsView currentUser={currentUser} onSaved={syncReminders} />;
  }

  return (
    <div className="app-shell">
      <div className="motion-aurora" aria-hidden="true" />
      <HomeNoticePopup
        active={activeView === "dashboard"}
        revision={noticeRevision}
        onOpenTask={openNotifiedTask}
        onViewTasks={() => navigateWithGravity("tasks")}
        onChanged={() => setNoticeRevision((current) => current + 1)}
      />
      <Navbar activeView={activeView} currentUser={currentUser} onNavigate={navigateWithGravity} onLogout={onLogout} />
      <main ref={mainContentRef} className={`main-content ${activeView === "analytics" ? "analytics-main-content" : ""}`}>
        <header className="topbar" data-gravity>
          <div>
            <p className="eyebrow">{page.eyebrow}</p>
            <h1>{activeView === "dashboard" ? `Good morning, ${firstName}` : page.title} {activeView === "dashboard" && <span>✦</span>}</h1>
            <p>{page.description}</p>
          </div>
          <div className="topbar-actions">
            <NotificationBell revision={noticeRevision} onOpenTask={openNotifiedTask} onViewTasks={() => navigateWithGravity("tasks")} />
            {activeView !== "settings" && activeView !== "analytics" && <button className="primary-button add-task-button" type="button" onClick={openCreateModal}><span aria-hidden="true">＋</span> Add task</button>}
          </div>
        </header>

        {error && <div className="error-banner" role="alert" data-reveal><span>Unable to complete that action: {error}</span><button type="button" onClick={loadDashboard}>Try again</button></div>}
        <div className="view-stage" key={activeView}>
          {renderView()}
        </div>
      </main>

      {isModalOpen && <TaskForm task={editingTask} onSubmit={saveTask} onCancel={closeModal} isSaving={isSaving} />}
    </div>
  );
}
