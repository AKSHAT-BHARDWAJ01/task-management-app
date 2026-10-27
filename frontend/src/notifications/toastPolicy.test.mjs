import assert from "node:assert/strict";
import test from "node:test";

import { canShowBrowserNotification, shouldShowToast } from "./toastPolicy.js";

test("a repeated success message is suppressed while the first toast is fresh", () => {
  const recent = [{ message: "Task created successfully.", tone: "success", at: 1_000 }];
  assert.equal(shouldShowToast(recent, { message: "Task created successfully.", tone: "success" }, 1_400), false);
  assert.equal(shouldShowToast(recent, { message: "Task created successfully.", tone: "success" }, 3_000), true);
});

test("a failure is not treated as a duplicate of a success", () => {
  const recent = [{ message: "Couldn't save your changes.", tone: "error", at: 1_000 }];
  assert.equal(shouldShowToast(recent, { message: "Couldn't save your changes.", tone: "success" }, 1_200), true);
});

test("browser notifications stay off without permission", () => {
  assert.equal(canShowBrowserNotification({ supported: true, permission: "default", enabled: true }), false);
  assert.equal(canShowBrowserNotification({ supported: true, permission: "denied", enabled: true }), false);
  assert.equal(canShowBrowserNotification({ supported: false, permission: "granted", enabled: true }), false);
  assert.equal(canShowBrowserNotification({ supported: true, permission: "granted", enabled: true }), true);
});
