import { redirect } from "@tanstack/react-router";
import { isAuthenticated } from "./auth-store";

/** Redirect unauthenticated users to sign-in. Use in route `beforeLoad`. */
export function requireAuth() {
  if (!isAuthenticated()) {
    throw redirect({ to: "/signin" });
  }
}

export function editorEntryPath() {
  return isAuthenticated() ? "/projects" : "/signin";
}
