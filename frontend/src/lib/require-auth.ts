import { redirect } from "@tanstack/react-router";
import { getSession, isAuthenticated, type AuthUser } from "./auth-store";

function isClient() {
  return typeof window !== "undefined";
}

/** Default landing route after sign-in. God admin goes straight to the console. */
export function defaultAppPath(user?: AuthUser | null): "/admin" | "/projects" {
  return user?.is_god_admin ? "/admin" : "/projects";
}

/** Redirect unauthenticated users to sign-in. Use in route `beforeLoad`. */
export function requireAuth() {
  // Session lives in browser storage — skip on SSR to avoid a sign-in flash before hydration.
  if (!isClient()) return;
  if (!isAuthenticated()) {
    throw redirect({ to: "/signin" });
  }
}

/** Redirect non-god-admin users away from admin routes. */
export function requireAdmin() {
  if (!isClient()) return;
  requireAuth();
  const user = getSession();
  if (!user?.is_god_admin) {
    throw redirect({ to: "/projects" });
  }
}

export function isAdminUser(): boolean {
  if (!isClient()) return false;
  return getSession()?.is_god_admin === true;
}

/** Redirect authenticated users away from guest-only routes (signin/signup). */
export function redirectIfAuthenticated(to?: "/admin" | "/projects") {
  if (!isClient()) return;
  if (isAuthenticated()) {
    throw redirect({ to: to ?? defaultAppPath(getSession()) });
  }
}

export function editorEntryPath() {
  if (!isClient()) return "/signin";
  return isAuthenticated() ? defaultAppPath(getSession()) : "/signin";
}
