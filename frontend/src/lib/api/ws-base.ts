/** Dev: same-origin WebSocket via Vite proxy. Prod: derive from VITE_API_URL or current host. */
export function resolveWsBase(): string {
  if (typeof window === "undefined") {
    return "ws://127.0.0.1:8000/api/v1/ws";
  }

  const envUrl = import.meta.env?.VITE_API_URL as string | undefined;
  if (envUrl) {
    const httpUrl = envUrl.replace(/\/api\/v1\/?$/, "");
    return httpUrl.replace(/^http/, "ws") + "/api/v1/ws";
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1/ws`;
}
