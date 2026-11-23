/**
 * Authenticated cursor poller for GET /api/events.
 * Bootstrap: omit `after` to receive a settled cursor with no history.
 */

const DEFAULT_INTERVAL_MS = 15_000;
const MIN_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

export function createEventPoller({
  fetchEvents,
  onEvents,
  onReset,
  onError,
  intervalMs = DEFAULT_INTERVAL_MS,
  storageKey = null,
  now = () => Date.now(),
}) {
  let cursor = null;
  let timer = null;
  let stopped = true;
  let inFlight = false;
  let backoffMs = intervalMs;
  let seen = new Set();
  let hidden = false;

  if (storageKey && typeof localStorage !== "undefined") {
    const saved = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= 0) cursor = saved;
  }

  function persist() {
    if (storageKey && cursor != null && typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, String(cursor));
    }
  }

  function clearPersist() {
    if (storageKey && typeof localStorage !== "undefined") {
      localStorage.removeItem(storageKey);
    }
  }

  function schedule(delay = backoffMs) {
    if (stopped || hidden) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void tick();
    }, delay);
  }

  async function tick() {
    if (stopped || inFlight || hidden) return;
    inFlight = true;
    try {
      const feed = await fetchEvents(cursor);
      if (stopped) return;

      if (feed?.reset) {
        cursor = feed.cursor ?? 0;
        seen = new Set();
        persist();
        onReset?.(feed);
      } else if (cursor == null) {
        // Bootstrap response: empty events + settled cursor.
        cursor = feed.cursor ?? 0;
        persist();
      } else {
        const fresh = [];
        for (const event of feed.events || []) {
          const key = event.event_id || `id:${event.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          fresh.push(event);
        }
        if (seen.size > 500) {
          seen = new Set([...seen].slice(-250));
        }
        if (typeof feed.cursor === "number") {
          cursor = Math.max(cursor, feed.cursor);
          persist();
        }
        if (fresh.length) onEvents?.(fresh, feed);
        if (feed.has_more) {
          inFlight = false;
          backoffMs = intervalMs;
          schedule(0);
          return;
        }
      }
      backoffMs = intervalMs;
    } catch (error) {
      onError?.(error);
      backoffMs = Math.min(MAX_BACKOFF_MS, Math.max(MIN_BACKOFF_MS, backoffMs * 2));
    } finally {
      inFlight = false;
      schedule(backoffMs);
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      hidden = false;
      backoffMs = intervalMs;
      schedule(0);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    pauseForHidden() {
      hidden = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    resumeFromHidden() {
      if (stopped) return;
      hidden = false;
      backoffMs = intervalMs;
      schedule(0);
    },
    resetCursor() {
      cursor = null;
      seen = new Set();
      clearPersist();
    },
    getCursor() {
      return cursor;
    },
    /** Test helper */
    async forceTick() {
      return tick();
    },
    _now: now,
  };
}
