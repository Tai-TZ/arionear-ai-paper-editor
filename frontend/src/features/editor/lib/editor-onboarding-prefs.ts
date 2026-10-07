const EDITOR_ONBOARDING_SEEN_KEY = "edico-editor-onboarding-seen";

export function hasSeenEditorOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(EDITOR_ONBOARDING_SEEN_KEY) === "1";
}

export function markEditorOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EDITOR_ONBOARDING_SEEN_KEY, "1");
}
