import arioAvatar from "../../assets/avatar/avatar-chat.png";

type EditorEntrySplashProps = {
  exiting?: boolean;
  label?: string;
};

export function EditorEntrySplash({ exiting = false, label = "Loading..." }: EditorEntrySplashProps) {
  return (
    <div
      className={`editor-entry-splash ${exiting ? "editor-entry-splash-exit" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Loading editor"
    >
      <div className="editor-entry-splash-inner">
        <div className="editor-entry-splash-icon-wrap">
          <div className="editor-entry-splash-icon-glow" aria-hidden />
          <img src={arioAvatar} alt="" className="editor-entry-splash-icon" />
        </div>
        <div className="editor-entry-splash-bar" aria-hidden>
          <div className="editor-entry-splash-bar-fill" />
        </div>
        <p className="editor-entry-splash-label">{label}</p>
      </div>
    </div>
  );
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
