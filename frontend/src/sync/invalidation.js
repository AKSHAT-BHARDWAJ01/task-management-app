/**
 * Map domain event types to coarse client refresh scopes.
 * Events are change signals only — callers refetch authoritative APIs.
 */

export function scopesForEvent(event) {
  const type = event?.type || "";
  const scopes = new Set();

  if (type.startsWith("task.")) {
    scopes.add("tasks");
    scopes.add("stats");
    if (event?.entity?.id) scopes.add(`task:${event.entity.id}`);
    if (event.project_id) {
      scopes.add("projects");
      scopes.add(`project:${event.project_id}`);
    }
  }
  if (type.startsWith("notification.") || type.startsWith("reminder.")) {
    scopes.add("notifications");
  }
  if (type.startsWith("project.") || type.startsWith("milestone.")) {
    scopes.add("projects");
    if (event.project_id) scopes.add(`project:${event.project_id}`);
  }
  if (type.startsWith("workspace.") || type.startsWith("invitation.")) {
    scopes.add("workspaces");
  }
  if (type === "preferences.updated") {
    scopes.add("preferences");
  }

  return [...scopes];
}

export function mergeScopes(events) {
  const merged = new Set();
  for (const event of events) {
    for (const scope of scopesForEvent(event)) merged.add(scope);
  }
  return [...merged];
}
