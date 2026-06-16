import {
  apiFetchMe,
  apiForgotPassword,
  apiLogin,
  apiRegister,
  apiResetPassword,
  type AuthUser,
} from "./auth-api";
import { clearProfileCache } from "./researcher-profile";
import { fetchDedupe, invalidateFetchKey, invalidateFetchPrefix } from "./api/fetch-dedupe";
import { normalizeEmail, validateEmail, validateName, validatePassword } from "./auth-validation";

export type { AuthUser };

const TOKEN_KEY = "arionear-access-token";
const USER_KEY = "arionear-session";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorages(): StorageLike[] {
  if (typeof window === "undefined") return [];
  return [sessionStorage, localStorage];
}

function readFromStorages(key: string): string | null {
  for (const storage of getStorages()) {
    const value = storage.getItem(key);
    if (value) return value;
  }
  return null;
}

function writeToStorage(storage: StorageLike, key: string, value: string | null) {
  if (value) storage.setItem(key, value);
  else storage.removeItem(key);
}

function readToken(): string | null {
  return readFromStorages(TOKEN_KEY);
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

function persistSession(user: AuthUser, accessToken: string, remember = false) {
  clearSession();
  const storage = remember ? localStorage : sessionStorage;
  writeToStorage(storage, TOKEN_KEY, accessToken);
  writeToStorage(storage, USER_KEY, JSON.stringify(user));
}

function writeCachedUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  const storage = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
  writeToStorage(storage, USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  for (const storage of getStorages()) {
    writeToStorage(storage, TOKEN_KEY, null);
    writeToStorage(storage, USER_KEY, null);
  }
}

/** Clear all browser storage on sign-out (local + session). */
export function clearAllBrowserStorage() {
  if (typeof window === "undefined") return;
  localStorage.clear();
  sessionStorage.clear();
}

export function signOut() {
  invalidateFetchKey("auth:me");
  invalidateFetchPrefix("papers:");
  invalidateFetchPrefix("profile:");
  invalidateFetchPrefix("providers");
  invalidateFetchPrefix("compile:");
  invalidateFetchPrefix("session:");
  clearProfileCache();
  clearAllBrowserStorage();
}

export function logoutUser() {
  signOut();
}

/** SSO is not implemented — stub prevents broken imports in legacy UI. */
export type OAuthProvider = "google" | "github";

export function loginWithOAuth(
  _provider: OAuthProvider,
): { ok: false; error: string } {
  return { ok: false, error: "Single sign-on is not available yet. Use email and password." };
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

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  affiliation?: string;
}): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const nameError = validateName(input.name);
  if (nameError) return { ok: false, error: nameError };
  const emailError = validateEmail(input.email);
  if (emailError) return { ok: false, error: emailError };
  const pwError = validatePassword(input.password);
  if (pwError) return { ok: false, error: pwError };

  const result = await apiRegister({
    name: input.name.trim(),
    email: normalizeEmail(input.email),
    password: input.password,
    affiliation: input.affiliation?.trim() || undefined,
  });
  if (!result.ok) return result;
  persistSession(result.user, result.accessToken);
  return { ok: true, user: result.user };
}

export async function loginUser(
  email: string,
  password: string,
  remember = false,
): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
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
): Promise<
  | { ok: true; message: string; devResetUrl?: string }
  | { ok: false; error: string }
> {
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

/** Validate cached session against API (optional on app load). */
export async function refreshSession(): Promise<AuthUser | null> {
  const token = readToken();
  if (!token) {
    clearSession();
    return null;
  }
  const user = await fetchDedupe("auth:me", () => apiFetchMe(token));
  if (!user) {
    clearSession();
    invalidateFetchKey("auth:me");
    return null;
  }
  writeCachedUser(user);
  return user;
}
