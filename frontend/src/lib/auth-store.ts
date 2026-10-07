import {
  apiFetchMe,
  apiForgotPassword,
  apiLogin,
  apiResetPassword,
  apiSendSignupCode,
  apiVerifySignup,
  getGoogleOAuthStartPath,
  type AuthUser,
} from "./auth-api";
import type { AuthErrorCode } from "./auth-api-errors";
import { clearProfileCache } from "./researcher-profile";
import { fetchDedupe, invalidateFetchKey, invalidateFetchPrefix } from "./api/fetch-dedupe";
import { normalizeEmail, validateEmail, validateName, validatePassword } from "./auth-validation";

export type { AuthUser };

const TOKEN_KEY = "edico-access-token";
const USER_KEY = "edico-session";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function authStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return localStorage;
}

/** Legacy sessions lived in sessionStorage (tab-scoped); promote to localStorage once. */
function migrateSessionStorageToLocal() {
  if (typeof window === "undefined") return;
  for (const key of [TOKEN_KEY, USER_KEY] as const) {
    const legacy = sessionStorage.getItem(key);
    if (!legacy) continue;
    if (!localStorage.getItem(key)) localStorage.setItem(key, legacy);
    sessionStorage.removeItem(key);
  }
}

function readFromStorages(key: string): string | null {
  migrateSessionStorageToLocal();
  const storage = authStorage();
  if (!storage) return null;
  return storage.getItem(key) ?? sessionStorage.getItem(key);
}

function writeToStorage(storage: StorageLike, key: string, value: string | null) {
  if (value) storage.setItem(key, value);
  else storage.removeItem(key);
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as { exp?: number };
    return typeof parsed.exp === "number" ? parsed.exp : null;
  } catch {
    return null;
  }
}

function isAccessTokenExpired(token: string): boolean {
  const exp = decodeJwtExp(token);
  if (exp === null) return false;
  return Date.now() >= exp * 1000;
}

function readToken(): string | null {
  const token = readFromStorages(TOKEN_KEY);
  if (!token) return null;
  if (isAccessTokenExpired(token)) {
    clearSession();
    return null;
  }
  return token;
}

function readCachedUser(): AuthUser | null {
  try {
    const raw = readFromStorages(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persistSession(user: AuthUser, accessToken: string, _remember = false) {
  clearSession();
  const storage = authStorage();
  if (!storage) return;
  writeToStorage(storage, TOKEN_KEY, accessToken);
  writeToStorage(storage, USER_KEY, JSON.stringify(user));
}

function writeCachedUser(user: AuthUser) {
  const storage = authStorage();
  if (!storage) return;
  writeToStorage(storage, USER_KEY, JSON.stringify(user));
}

function clearSession() {
  if (typeof window === "undefined") return;
  for (const storage of [localStorage, sessionStorage]) {
    writeToStorage(storage, TOKEN_KEY, null);
    writeToStorage(storage, USER_KEY, null);
  }
}

/**
 * Sign-out: drop the auth session and the tab-scoped caches of the user's work (sessionStorage),
 * but keep device preferences in localStorage (locale, theme, editor layout).
 */
function clearUserBrowserStorage() {
  if (typeof window === "undefined") return;
  clearSession();
  sessionStorage.clear();
}

export function signOut() {
  invalidateFetchKey("auth:me");
  invalidateFetchPrefix("papers:");
  invalidateFetchPrefix("profile:");
  invalidateFetchPrefix("providers");
  invalidateFetchPrefix("compile:");
  invalidateFetchPrefix("session:");
  invalidateFetchPrefix("admin:");
  clearProfileCache();
  clearUserBrowserStorage();
}

export function logoutUser() {
  signOut();
}

/** Start Google OAuth — browser navigates to backend, then returns via /auth/google/callback. */
export function startGoogleOAuth(options?: { returnTo?: string; remember?: boolean }): void {
  if (typeof window === "undefined") return;
  const path = getGoogleOAuthStartPath(
    options?.returnTo ?? "/projects",
    options?.remember ?? false,
  );
  window.location.assign(path);
}

export async function completeOAuthSession(
  accessToken: string,
  remember = false,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  invalidateFetchKey("auth:me");
  const result = await apiFetchMe(accessToken);
  if (result.status !== "ok") {
    return { ok: false, error: "Could not verify your Google sign-in. Please try again." };
  }
  persistSession(result.user, accessToken, remember);
  return { ok: true, user: result.user };
}

export function getAccessToken() {
  return readToken();
}

export function getSession(): AuthUser | null {
  return readCachedUser();
}

export function isAuthenticated() {
  return Boolean(readToken() && readCachedUser());
}

export async function sendSignupVerificationCode(input: {
  name: string;
  email: string;
  password: string;
  affiliation?: string;
}): Promise<
  { ok: true; message: string; devVerificationCode?: string } | { ok: false; error: string }
> {
  const nameError = validateName(input.name);
  if (nameError) return { ok: false, error: nameError };
  const emailError = validateEmail(input.email);
  if (emailError) return { ok: false, error: emailError };
  const pwError = validatePassword(input.password);
  if (pwError) return { ok: false, error: pwError };

  return apiSendSignupCode({
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    password: input.password,
    affiliation: input.affiliation?.trim() || undefined,
  });
}

export async function verifySignupCode(
  email: string,
  code: string,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };
  const cleaned = code.trim();
  if (!/^\d{6}$/.test(cleaned)) {
    return { ok: false, error: "Please enter the 6-digit verification code." };
  }

  const result = await apiVerifySignup(normalizeEmail(email), cleaned);
  if (!result.ok) return result;
  persistSession(result.user, result.accessToken);
  return { ok: true, user: result.user };
}

export async function loginUser(
  email: string,
  password: string,
  remember = false,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string; code?: AuthErrorCode }> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };
  if (!password) return { ok: false, error: "Please enter your password." };

  const result = await apiLogin(normalizeEmail(email), password, remember);
  if (!result.ok) return result;
  invalidateFetchKey("auth:me");
  persistSession(result.user, result.accessToken, remember);
  return { ok: true, user: result.user };
}

export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true; message: string; devResetUrl?: string } | { ok: false; error: string }> {
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, error: emailError };
  return apiForgotPassword(normalizeEmail(email));
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const pwError = validatePassword(password);
  if (pwError) return { ok: false, error: pwError };
  if (!token.trim()) return { ok: false, error: "Reset link is invalid or has expired." };
  return apiResetPassword(token.trim(), password);
}

/**
 * Validate the cached session against the API (optional on app load).
 * Returns null when the user could not be verified; the session is cleared only when the server
 * rejects the token (401) — a network blip or server error leaves the user signed in.
 */
export async function refreshSession(): Promise<AuthUser | null> {
  const token = readToken();
  if (!token) {
    return null;
  }
  const result = await fetchDedupe("auth:me", () => apiFetchMe(token));
  if (result.status === "unauthorized") {
    clearSession();
    invalidateFetchKey("auth:me");
    return null;
  }
  if (result.status === "error") {
    return null;
  }
  writeCachedUser(result.user);
  return result.user;
}
