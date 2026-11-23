/**
 * Unified sync is off by default. Even when explicitly enabled, never call the
 * new event/device endpoints against the known production API host.
 */

const PRODUCTION_API_HOSTS = new Set(["task-manager-api-coral-five.vercel.app"]);

export function resolveApiOrigin(apiBaseUrl) {
  const raw = String(apiBaseUrl || "").replace(/\/$/, "");
  const withoutApi = raw.endsWith("/api") ? raw.slice(0, -4) : raw;
  try {
    return new URL(withoutApi.includes("://") ? withoutApi : `https://${withoutApi}`);
  } catch {
    return null;
  }
}

export function isUnifiedSyncEnabled(apiBaseUrl) {
  if (String(import.meta.env.VITE_ENABLE_UNIFIED_SYNC || "").toLowerCase() !== "true") {
    return false;
  }
  const origin = resolveApiOrigin(apiBaseUrl);
  if (!origin) return false;
  if (PRODUCTION_API_HOSTS.has(origin.hostname)) return false;
  return true;
}
