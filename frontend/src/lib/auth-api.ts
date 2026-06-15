import { mapAuthHttpError } from "./auth-api-errors";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  "http://localhost:8000/api/v1";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  affiliation?: string;
  provider?: "email";
};

export type AuthResult =
  | { ok: true; user: AuthUser; accessToken: string }
  | { ok: false; error: string };

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
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
    throw new Error(mapAuthHttpError(res.status, detail));
  }
  return res.json() as Promise<T>;
}

export async function apiRegister(input: {
  name: string;
  email: string;
  password: string;
  affiliation?: string;
}): Promise<AuthResult> {
  try {
    const data = await authFetch<{
      access_token: string;
      user: AuthUser;
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { ok: true, user: data.user, accessToken: data.access_token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Registration failed." };
  }
}

export async function apiLogin(
  email: string,
  password: string,
  remember = false,
): Promise<AuthResult> {
  try {
    const data = await authFetch<{
      access_token: string;
      user: AuthUser;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, remember }),
    });
    return { ok: true, user: data.user, accessToken: data.access_token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sign in failed." };
  }
}

export async function apiForgotPassword(
  email: string,
): Promise<{ ok: true; message: string; devResetUrl?: string } | { ok: false; error: string }> {
  try {
    const data = await authFetch<{ message: string; dev_reset_url?: string }>(
      "/auth/forgot-password",
      { method: "POST", body: JSON.stringify({ email }) },
    );
    return {
      ok: true,
      message: data.message,
      devResetUrl: data.dev_reset_url,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed." };
  }
}

export async function apiResetPassword(
  token: string,
  password: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const data = await authFetch<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    return { ok: true, message: data.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Reset failed." };
  }
}

export async function apiFetchMe(token: string): Promise<AuthUser | null> {
  try {
    return await authFetch<AuthUser>("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
}
