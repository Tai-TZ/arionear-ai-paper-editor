import { MessageSquarePlus, Sparkles, X } from "lucide-react";

import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";

function preventBlur(e: React.MouseEvent) {
  e.preventDefault();
}

type EditorSelectionToolbarProps = {
  context: EditorSelectionContext;
  anchor: { top: number; left: number };
  onAddToChat: () => void;
  onQuickEdit: () => void;
  onDismiss: () => void;
};

export function EditorSelectionToolbar({
  context,
  anchor,
  onAddToChat,
  onQuickEdit,
  onDismiss,
}: EditorSelectionToolbarProps) {
  const lineLabel =
    context.lineStart === context.lineEnd
      ? `dòng ${context.lineStart}`
      : `dòng ${context.lineStart}–${context.lineEnd}`;

  return (
    <div
      className="editor-selection-toolbar"
      style={{
        top: Math.max(8, anchor.top - 8),
        left: anchor.left,
      }}
      role="toolbar"
      aria-label="Tùy chọn vùng chọn"
    >
      <span className="editor-selection-toolbar-meta">{lineLabel}</span>
      <button
        type="button"
        className="editor-selection-toolbar-btn"
        onMouseDown={preventBlur}
        onClick={onAddToChat}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
        Add to chat
      </button>
      <button
        type="button"
        className="editor-selection-toolbar-btn editor-selection-toolbar-btn-primary"
        onMouseDown={preventBlur}
        onClick={onQuickEdit}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Quick Edit
        <kbd className="editor-selection-kbd">Ctrl+K</kbd>
      </button>
      <button
        type="button"
        className="editor-selection-toolbar-icon"
        onMouseDown={preventBlur}
        onClick={onDismiss}
        aria-label="Đóng"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
