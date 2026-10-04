/**
 * Base URL of the backend API.
 *
 * - `VITE_API_URL` set at build time: use it (API served from its own origin).
 * - Otherwise same-origin `/api/v1` — the Vite dev proxy in development, the reverse proxy in
 *   front of the app in production. Never fall back to a developer's localhost in a build.
 *
 * The relative base only resolves in the browser; no SSR code path calls the API (routes that
 * fetch are `ssr: false`, auth guards skip on the server, data loads in effects).
 */
export function resolveApiBase(): string {
  const envUrl = import.meta.env?.VITE_API_URL;
  if (typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim();
  }
  return "/api/v1";
}
