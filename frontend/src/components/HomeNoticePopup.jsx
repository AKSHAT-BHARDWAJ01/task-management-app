import { useEffect, useState } from "react";

import { notificationApi } from "../api/taskApi";

const SEEN_KEY = "taskflow-home-popups";

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
  if (Number.isNaN(date.getTime())) return "now";
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function readSeen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function remember(ids) {
  const seen = readSeen();
  ids.forEach((id) => seen.add(id));
  sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-80)));
}

export function HomeNoticePopup({ active, revision, onOpenTask, onViewTasks, onChanged }) {
  const [cards, setCards] = useState([]);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    notificationApi.list({ limit: 12 })
      .then((page) => {
        if (stopped) return;
        const seen = readSeen();
        const fresh = (page.items ?? [])
          .map(normalize)
          .filter((item) => !item.readAt && !seen.has(item.id))
          .slice(0, 3);
        if (!fresh.length) return;
        remember(fresh.map((item) => item.id));
        const unread = page.unread_count ?? fresh.length;
        setExtra(Math.max(unread - fresh.length, 0));
        setCards((current) => {
          const visible = new Set(current.map((item) => item.id));
          const incoming = fresh.filter((item) => !visible.has(item.id));
          return [...incoming, ...current].slice(0, 3);
        });
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [active, revision]);

  useEffect(() => {
    if (!cards.length) return undefined;
    const timer = window.setTimeout(() => setCards([]), 8000);
    return () => window.clearTimeout(timer);
  }, [cards]);

  async function openCard(item) {
    setCards((current) => current.filter((card) => card.id !== item.id));
    try {
      await notificationApi.markRead(item.id);
      onChanged?.();
    } catch {
      // The bell keeps the unread item if this request fails.
    }
    if (item.type === "summary" || !item.taskId) onViewTasks();
    else onOpenTask(item.taskId);
  }

  function dismiss(item) {
    setCards((current) => current.filter((card) => card.id !== item.id));
  }

  if (!active || !cards.length) return null;

  return (
    <div className="message-popups" aria-live="polite" aria-relevant="additions">
      {cards.map((item) => (
        <article className="message-popup" key={item.id} role="status">
          <img className="message-popup-mark" src="/favicon.ico" alt="" />
          <button type="button" className="message-popup-body" onClick={() => openCard(item)}>
            <span className="message-popup-meta">
              <strong>TaskFlow</strong>
              <time dateTime={item.createdAt}>{formatWhen(item.createdAt)}</time>
            </span>
            <span className="message-popup-title">{item.title}</span>
            <span className="message-popup-text">{item.message}</span>
          </button>
          <button type="button" className="message-popup-close" aria-label={`Dismiss ${item.title}`} onClick={() => dismiss(item)}>×</button>
        </article>
      ))}
      {extra > 0 && (
        <button type="button" className="message-popup-more" onClick={() => window.dispatchEvent(new CustomEvent("taskflow:open-notices"))}>
          {extra} more notification{extra === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
