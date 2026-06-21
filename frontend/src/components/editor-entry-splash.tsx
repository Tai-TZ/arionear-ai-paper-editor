import { AppLoadingScreen } from "@/components/app-loading-screen";

type EditorEntrySplashProps = {
  exiting?: boolean;
  label?: string;
};

export function EditorEntrySplash({ exiting = false, label = "Loading..." }: EditorEntrySplashProps) {
  return <AppLoadingScreen label={label} variant="fullscreen" exiting={exiting} />;
}

export const EDITOR_ENTRY_FLAG = "arionear:editor-entry";

export function markEditorEntryTransition() {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(EDITOR_ENTRY_FLAG, "1");
  }
}

export function consumeEditorEntryTransition(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const flagged = sessionStorage.getItem(EDITOR_ENTRY_FLAG) === "1";
  if (flagged) sessionStorage.removeItem(EDITOR_ENTRY_FLAG);
  return flagged;
}
