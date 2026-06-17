import { redirect } from "@tanstack/react-router";
import { isAuthenticated } from "./auth-store";

function isClient() {
  return typeof window !== "undefined";
}

/** Redirect unauthenticated users to sign-in. Use in route `beforeLoad`. */
export function requireAuth() {
  // Session lives in browser storage — skip on SSR to avoid a sign-in flash before hydration.
  if (!isClient()) return;
  if (!isAuthenticated()) {
    throw redirect({ to: "/signin" });
  }
}

/** Redirect authenticated users away from guest-only routes (signin/signup). */
export function redirectIfAuthenticated(to = "/projects") {
  if (!isClient()) return;
  if (isAuthenticated()) {
    throw redirect({ to });
  }
}

export function editorEntryPath() {
  if (!isClient()) return "/signin";
  return isAuthenticated() ? "/projects" : "/signin";
}
