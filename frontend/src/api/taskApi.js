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

async function request(path = "", options = {}) {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
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

export const taskApi = {
  getAll: () => request(),
  getStats: () => request("/stats"),
  create: (task) =>
    request("", { method: "POST", body: JSON.stringify(task) }),
  update: (id, task) =>
    request(`/${id}`, { method: "PUT", body: JSON.stringify(task) }),
  remove: (id) => request(`/${id}`, { method: "DELETE" }),
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

export const authApi = {
  register: (credentials) => authRequest("/register", credentials),
  login: (credentials) => authRequest("/login", credentials),
};
