import { useCallback, useEffect, useId, useRef, useState } from "react";

import { notificationApi } from "../api/taskApi";

function normalize(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    message: item.message,
    taskId: item.taskId ?? item.task_id ?? null,
    createdAt: item.createdAt ?? item.created_at,
    readAt: item.readAt ?? item.read_at ?? null,
  };
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell({ revision, onOpenTask, onViewTasks }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("idle");
  const panelId = useId();
  const panelRef = useRef(null);

  const load = useCallback(async (offset = 0) => {
    setStatus(offset ? "loading-more" : "loading");
    try {
      const page = await notificationApi.list({ offset });
      const nextItems = (page.items ?? []).map(normalize);
      setItems((current) => (offset ? [...current, ...nextItems] : nextItems));
      setUnread(page.unread_count ?? 0);
      setTotal(page.total ?? nextItems.length);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load, revision]);

  useEffect(() => {
    function openPanel() {
      setOpen(true);
    }
    window.addEventListener("taskflow:open-notices", openPanel);
    return () => window.removeEventListener("taskflow:open-notices", openPanel);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event) {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  async function choose(item) {
    try {
      await notificationApi.markRead(item.id);
    } catch {
      setStatus("error");
      return;
    }
    setOpen(false);
    if (item.type === "summary" || !item.taskId) onViewTasks();
    else onOpenTask(item.taskId);
    load(0);
  }

  async function markAll() {
    try {
      await notificationApi.markAllRead();
      load(0);
    } catch {
      setStatus("error");
    }
  }

  async function dismiss(event, item) {
    event.stopPropagation();
    try {
      await notificationApi.dismiss(item.id);
      load(0);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="notice-menu" ref={panelRef}>
      <button
        className="notice-bell"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">◔</span>
        {unread > 0 && <strong>{unread > 9 ? "9+" : unread}</strong>}
      </button>
      {open && (
        <section className="notice-panel" id={panelId} aria-label="Notifications">
          <header>
            <h2>Notifications</h2>
            <button type="button" onClick={markAll} disabled={!unread}>Mark all read</button>
          </header>
          {status === "loading" && <p className="notice-state">Loading notifications…</p>}
          {status === "error" && (
            <p className="notice-state">
              Couldn't load notifications.
              <button type="button" onClick={() => load(0)}>Try again</button>
            </p>
          )}
          {status === "ready" && !items.length && <p className="notice-state">You're all caught up. Deadline reminders will show up here.</p>}
          {status !== "loading" && status !== "error" && (
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <button className={item.readAt ? "notice-read" : "notice-unread"} type="button" onClick={() => choose(item)}>
                    <span className={`notice-dot notice-${item.type}`} aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.message}</small>
                      <time dateTime={item.createdAt}>{formatWhen(item.createdAt)}</time>
                    </span>
                  </button>
                  <button type="button" aria-label={`Dismiss ${item.title}`} onClick={(event) => dismiss(event, item)}>×</button>
                </li>
              ))}
            </ul>
          )}
          {items.length < total && status !== "error" && (
            <button className="notice-more" type="button" onClick={() => load(items.length)} disabled={status === "loading-more"}>
              {status === "loading-more" ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
