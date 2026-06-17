import { getAccessToken } from "@/lib/auth-store";
import { mapApiHttpError } from "@/lib/api/api-errors";
import { resolveApiBase } from "@/lib/api/base-url";
import { fetchDedupe, invalidateFetchKey } from "@/lib/api/fetch-dedupe";
import type { ResearcherProfile, ResearcherProfilePatch } from "@/lib/researcher-profile";
import { setCachedProfile } from "@/lib/researcher-profile";

const API_BASE = resolveApiBase();

async function profileFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated.");

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
    throw new Error("Cannot reach the server. Check that the backend is running on port 8000.");
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

  return res.json() as Promise<T>;
}

export async function fetchResearcherProfile(): Promise<ResearcherProfile> {
  const profile = await fetchDedupe("profile:me", () =>
    profileFetch<ResearcherProfile>("/users/me/profile"),
  );
  setCachedProfile(profile);
  return profile;
}

export async function updateResearcherProfile(
  patch: ResearcherProfilePatch,
): Promise<ResearcherProfile> {
  const profile = await profileFetch<ResearcherProfile>("/users/me/profile", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  invalidateFetchKey("profile:me");
  setCachedProfile(profile);
  return profile;
}
