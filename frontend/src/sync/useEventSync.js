import { useEffect, useRef } from "react";

import { apiRoot, eventsApi } from "../api/taskApi";
import { createEventPoller } from "./eventPoller";
import { isUnifiedSyncEnabled } from "./featureFlags";
import { mergeScopes } from "./invalidation";

/**
 * Starts the authenticated event poller when unified sync is enabled.
 * @param {{ enabled?: boolean, userId?: number|string|null, onScopes?: (scopes: string[]) => void }} options
 */
export function useEventSync({ enabled = true, userId = null, onScopes } = {}) {
  const onScopesRef = useRef(onScopes);
  onScopesRef.current = onScopes;

  useEffect(() => {
    if (!enabled || !userId || !isUnifiedSyncEnabled(apiRoot)) return undefined;

    const poller = createEventPoller({
      storageKey: `taskflow-event-cursor:${userId}`,
      fetchEvents: (after) => eventsApi.list(after == null ? {} : { after }),
      onEvents: (events) => {
        const scopes = mergeScopes(events);
        if (scopes.length) onScopesRef.current?.(scopes);
      },
      onReset: () => {
        onScopesRef.current?.(["tasks", "stats", "notifications", "workspaces", "projects"]);
      },
    });

    poller.start();

    function onVisibility() {
      if (document.visibilityState === "hidden") poller.pauseForHidden();
      else poller.resumeFromHidden();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      poller.stop();
    };
  }, [enabled, userId]);
}
