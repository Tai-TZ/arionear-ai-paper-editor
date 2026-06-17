/** Dev: same-origin `/api/v1` via Vite proxy. Prod: set VITE_API_URL at build time. */
export function resolveApiBase(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return "/api/v1";
  }
  return "http://localhost:8000/api/v1";
}
