import { getAccessToken, logoutUser } from "@/lib/auth-store";
import { resolveApiBase } from "@/lib/api/base-url";
import { mapApiHttpError } from "@/lib/api/api-errors";

const API_BASE = resolveApiBase();

export type PaperShareStatus = {
  enabled: boolean;
  token: string | null;
  created_at: string | null;
};

export type SharedPaperSnapshot = {
  id: string;
  name: string;
  latex: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};

async function shareFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running.");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      logoutUser();
      if (typeof window !== "undefined") {
        window.location.assign("/signin");
      }
      throw new Error("Not authenticated.");
    }
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(mapApiHttpError(res.status, detail));
  }

  return res.json() as Promise<T>;
}

export async function fetchPaperShareStatus(paperId: string): Promise<PaperShareStatus> {
  return shareFetch<PaperShareStatus>(`/papers/${paperId}/share`);
}

export async function enablePaperShare(paperId: string): Promise<PaperShareStatus> {
  return shareFetch<PaperShareStatus>(`/papers/${paperId}/share`, { method: "POST" });
}

export async function disablePaperShare(paperId: string): Promise<void> {
  await shareFetch<void>(`/papers/${paperId}/share`, { method: "DELETE" });
}

export async function fetchSharedPaper(token: string): Promise<SharedPaperSnapshot> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/share/${encodeURIComponent(token)}`);
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running.");
  }

  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(mapApiHttpError(res.status, detail));
  }

  return res.json() as Promise<SharedPaperSnapshot>;
}

export function buildShareUrl(token: string): string {
  if (typeof window === "undefined") {
    return `/share/${token}`;
  }
  return `${window.location.origin}/share/${token}`;
}
