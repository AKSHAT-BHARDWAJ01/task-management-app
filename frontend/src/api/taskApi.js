const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/tasks";

async function request(path = "", options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
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
  create: (task) =>
    request("", { method: "POST", body: JSON.stringify(task) }),
  update: (id, task) =>
    request(`/${id}`, { method: "PUT", body: JSON.stringify(task) }),
  remove: (id) => request(`/${id}`, { method: "DELETE" }),
};
