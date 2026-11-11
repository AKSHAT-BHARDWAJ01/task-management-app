const defaultApiRoot = import.meta.env.DEV
  ? "http://localhost:8000/api"
  : "https://task-manager-api-coral-five.vercel.app/api";

const configuredApiRoot = (
  import.meta.env.VITE_API_BASE_URL ?? defaultApiRoot
).replace(/\/$/, "");
const API_BASE_URL = configuredApiRoot.endsWith("/tasks")
  ? configuredApiRoot
  : `${configuredApiRoot}/tasks`;
const AUTH_BASE_URL = configuredApiRoot.endsWith("/auth")
  ? configuredApiRoot
  : `${configuredApiRoot}/auth`;
const TOKEN_STORAGE_KEY = "taskflow-access-token";
const USER_STORAGE_KEY = "taskflow-current-user";
// Allow extra time for Vercel Python cold starts + Supabase connect.
const REQUEST_TIMEOUT_MS = 25_000;

export function getAccessToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAccessToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function getCurrentUser() {
  const user = localStorage.getItem(USER_STORAGE_KEY);
  return user ? JSON.parse(user) : null;
}

export function setAuthenticatedSession(token, user) {
  setAccessToken(token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        import.meta.env.DEV
          ? "The API did not respond within 25 seconds. Restart the FastAPI server and try again."
          : "The API did not respond in time. The production API may be cold-starting or misconfigured — check the Vercel API deployment and DATABASE_URL."
      );
    }
    throw new Error(
      import.meta.env.DEV
        ? "Unable to reach the API. Check that the FastAPI server is running on port 8000."
        : "Unable to reach the production API. Verify the Vercel API deployment is healthy."
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function authorizedRequest(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map((error) => error.msg).join(", ")
      : detail || "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return response.status === 204 ? null : response.json();
}

function request(path = "", options = {}) {
  return authorizedRequest(`${API_BASE_URL}${path}`, options);
}

function rootRequest(path, options = {}) {
  return authorizedRequest(`${configuredApiRoot}${path}`, options);
}

export const taskApi = {
  getAll: () => request(),
  getStats: () => request("/stats"),
  create: (task) =>
    request("", { method: "POST", body: JSON.stringify(task) }),
  update: (id, task) =>
    request(`/${id}`, { method: "PUT", body: JSON.stringify(task) }),
  remove: (id) => request(`/${id}`, { method: "DELETE" }),
};

export const notificationApi = {
  list: ({ offset = 0, limit = 30 } = {}) => rootRequest(`/notifications?limit=${limit}&offset=${offset}`),
  sync: (timezone) => rootRequest("/notifications/sync", { method: "POST", body: JSON.stringify({ timezone }) }),
  preferences: () => rootRequest("/notifications/preferences"),
  savePreferences: (preferences) => rootRequest("/notifications/preferences", { method: "PUT", body: JSON.stringify(preferences) }),
  markRead: (id) => rootRequest(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => rootRequest("/notifications/read-all", { method: "POST" }),
  dismiss: (id) => rootRequest(`/notifications/${id}`, { method: "DELETE" }),
};

async function authRequest(path, payload) {
  const response = await fetchWithTimeout(`${AUTH_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || "Unable to authenticate. Please try again.");
  }
  return response.json();
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== false) {
      search.set(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const workspaceApi = {
  list: () => rootRequest("/workspaces"),
  create: (body) => rootRequest("/workspaces", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) => rootRequest(`/workspaces/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id) => rootRequest(`/workspaces/${id}`, { method: "DELETE" }),
  transfer: (id, userId) => rootRequest(`/workspaces/${id}/transfer`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  members: (id) => rootRequest(`/workspaces/${id}/members`),
  changeRole: (id, userId, role) => rootRequest(`/workspaces/${id}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) }),
  removeMember: (id, userId) => rootRequest(`/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
  invitations: (id) => rootRequest(`/workspaces/${id}/invitations`),
  invite: (id, body) => rootRequest(`/workspaces/${id}/invitations`, { method: "POST", body: JSON.stringify(body) }),
  revokeInvite: (id, inviteId) => rootRequest(`/workspaces/${id}/invitations/${inviteId}/revoke`, { method: "POST" }),
  resendInvite: (id, inviteId) => rootRequest(`/workspaces/${id}/invitations/${inviteId}/resend`, { method: "POST" }),
  previewInvite: (token) => rootRequest(`/invitations/preview?token=${encodeURIComponent(token)}`),
  acceptInvite: (token) => rootRequest("/invitations/accept", { method: "POST", body: JSON.stringify({ token }) }),
  declineInvite: (token) => rootRequest("/invitations/decline", { method: "POST", body: JSON.stringify({ token }) }),
  projects: (id, params) => rootRequest(`/workspaces/${id}/projects${toQuery(params)}`),
  createProject: (id, body) => rootRequest(`/workspaces/${id}/projects`, { method: "POST", body: JSON.stringify(body) }),
  project: (id) => rootRequest(`/projects/${id}`),
  updateProject: (id, body) => rootRequest(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveProject: (id) => rootRequest(`/projects/${id}/archive`, { method: "POST" }),
  restoreProject: (id) => rootRequest(`/projects/${id}/restore`, { method: "POST" }),
  deleteProject: (id) => rootRequest(`/projects/${id}`, { method: "DELETE" }),
  addProjectMember: (id, body) => rootRequest(`/projects/${id}/members`, { method: "POST", body: JSON.stringify(body) }),
  removeProjectMember: (id, userId) => rootRequest(`/projects/${id}/members/${userId}`, { method: "DELETE" }),
  tasks: (id) => rootRequest(`/projects/${id}/tasks`),
  milestones: (id) => rootRequest(`/projects/${id}/milestones`),
  createMilestone: (id, body) => rootRequest(`/projects/${id}/milestones`, { method: "POST", body: JSON.stringify(body) }),
  updateMilestone: (id, milestoneId, body) => rootRequest(`/projects/${id}/milestones/${milestoneId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMilestone: (id, milestoneId) => rootRequest(`/projects/${id}/milestones/${milestoneId}`, { method: "DELETE" }),
  activity: (id, offset = 0) => rootRequest(`/projects/${id}/activity?limit=30&offset=${offset}`),
};

export const authApi = {
  register: (credentials) => authRequest("/register", credentials),
  login: (credentials) => authRequest("/login", credentials),
};
