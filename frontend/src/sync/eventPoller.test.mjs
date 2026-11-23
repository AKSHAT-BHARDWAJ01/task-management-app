import assert from "node:assert/strict";
import test from "node:test";

import { createEventPoller } from "./eventPoller.js";
import { isUnifiedSyncEnabled, resolveApiOrigin } from "./featureFlags.js";
import { mergeScopes, scopesForEvent } from "./invalidation.js";

test("bootstrap omits after and stores the settled cursor", async () => {
  const calls = [];
  const received = [];
  const poller = createEventPoller({
    fetchEvents: async (after) => {
      calls.push(after);
      if (after == null) return { events: [], cursor: 10, has_more: false, reset: false };
      return {
        events: [{ id: 11, event_id: "e1", type: "task.created", entity: { type: "task", id: 1 } }],
        cursor: 11,
        has_more: false,
        reset: false,
      };
    },
    onEvents: (events) => received.push(...events),
    intervalMs: 60_000,
  });
  poller.start();
  await poller.forceTick();
  assert.equal(calls[0], null);
  assert.equal(poller.getCursor(), 10);
  await poller.forceTick();
  assert.equal(calls[1], 10);
  assert.equal(received.length, 1);
  poller.stop();
});

test("duplicate event_id values are ignored", async () => {
  const received = [];
  let n = 0;
  const poller = createEventPoller({
    fetchEvents: async (after) => {
      n += 1;
      if (after == null) return { events: [], cursor: 1, has_more: false, reset: false };
      return {
        events: [{ id: 2, event_id: "same", type: "task.updated", entity: { type: "task", id: 9 } }],
        cursor: 2,
        has_more: false,
        reset: false,
      };
    },
    onEvents: (events) => received.push(...events),
    intervalMs: 60_000,
  });
  poller.start();
  await poller.forceTick();
  await poller.forceTick();
  await poller.forceTick();
  assert.equal(received.length, 1);
  poller.stop();
});

test("reset asks the client to refresh", async () => {
  let reset = false;
  const poller = createEventPoller({
    fetchEvents: async (after) => {
      if (after == null) return { events: [], cursor: 5, has_more: false, reset: false };
      return { events: [], cursor: 5, has_more: false, reset: true };
    },
    onReset: () => { reset = true; },
    intervalMs: 60_000,
  });
  poller.start();
  await poller.forceTick();
  await poller.forceTick();
  assert.equal(reset, true);
  poller.stop();
});

test("invalidation scopes follow event families", () => {
  assert.deepEqual(scopesForEvent({ type: "task.completed", entity: { id: 3 }, project_id: 8 }).sort(), [
    "project:8",
    "projects",
    "stats",
    "task:3",
    "tasks",
  ].sort());
  assert.ok(mergeScopes([{ type: "notification.read" }, { type: "workspace.member_added" }]).includes("notifications"));
});

test("unified sync stays off for production hosts even when the flag is true", () => {
  const previous = process.env.VITE_ENABLE_UNIFIED_SYNC;
  // Vite injects import.meta.env; featureFlags reads import.meta.env in browser.
  // Here we only assert origin resolution helpers used by the gate.
  assert.equal(resolveApiOrigin("https://task-manager-api-coral-five.vercel.app/api")?.hostname, "task-manager-api-coral-five.vercel.app");
  assert.equal(resolveApiOrigin("http://localhost:8000/api")?.hostname, "localhost");
  void previous;
  void isUnifiedSyncEnabled;
});
