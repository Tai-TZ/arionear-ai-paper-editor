import { MessageCircle, PencilLine, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import type { EditorSelectionContext, SelectionAnchor } from "@/lib/editor-selection-anchor";
import type { editorCopy } from "@/lib/editor-i18n";

type SelectionToolbarCopy = ReturnType<typeof editorCopy>["selectionToolbar"];

function preventBlur(e: React.MouseEvent) {
  e.preventDefault();
}

function editShortcutLabel(): string {
  if (typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
    return "⌘K";
  }
  return "Ctrl+K";
}

type EditorSelectionToolbarProps = {
  context: EditorSelectionContext;
  anchor: SelectionAnchor;
  copy: SelectionToolbarCopy;
  onAskSelection: () => void;
  onEditSelection: () => void;
  onDismiss: () => void;
};

export function EditorSelectionToolbar({
  context,
  anchor,
  copy,
  onAskSelection,
  onEditSelection,
  onDismiss,
}: EditorSelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [placement, setPlacement] = useState<"below" | "above">("below");

  const lineLabel =
    context.lineStart === context.lineEnd
      ? copy.line(context.lineStart)
      : copy.lineRange(context.lineStart, context.lineEnd);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const parent = el.offsetParent as HTMLElement | null;
    const parentW = parent?.clientWidth ?? 0;
    const parentH = parent?.clientHeight ?? 0;
    const toolbarW = el.offsetWidth;
    const toolbarH = el.offsetHeight;
    const gap = 6;

    const fitsBelow = anchor.bottom + gap + toolbarH <= parentH - 4;
    const nextPlacement = fitsBelow ? "below" : "above";
    const top =
      nextPlacement === "below" ? anchor.bottom + gap : Math.max(4, anchor.top - gap - toolbarH);

    const minLeft = toolbarW / 2 + 8;
    const maxLeft = Math.max(minLeft, parentW - toolbarW / 2 - 8);
    const left = Math.min(maxLeft, Math.max(minLeft, anchor.left));

    setPlacement(nextPlacement);
    setCoords({ top, left });
  }, [anchor.bottom, anchor.top, anchor.left, lineLabel]);

  const shortcut = editShortcutLabel();

  return (
    <div
      ref={toolbarRef}
      className="editor-selection-toolbar"
      data-placement={placement}
      style={
        coords
          ? { top: coords.top, left: coords.left, visibility: "visible" }
          : { top: anchor.bottom + 6, left: anchor.left, visibility: "hidden" }
      }
      role="toolbar"
      aria-label={copy.ariaLabel}
    >
      <span className="editor-selection-toolbar-meta" title={lineLabel}>
        {lineLabel}
      </span>
      <span className="editor-selection-toolbar-divider" aria-hidden />
      <button
        type="button"
        className="editor-selection-toolbar-btn"
        onMouseDown={preventBlur}
        onClick={onAskSelection}
        title={copy.askSelectionTitle}
      >
        <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{copy.askSelection}</span>
      </button>
      <button
        type="button"
        className="editor-selection-toolbar-btn editor-selection-toolbar-btn-primary"
        onMouseDown={preventBlur}
        onClick={onEditSelection}
        title={`${copy.editSelectionTitle} (${shortcut})`}
      >
        <PencilLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{copy.editSelection}</span>
        <kbd className="editor-selection-kbd">{shortcut}</kbd>
      </button>
      <button
        type="button"
        className="editor-selection-toolbar-icon"
        onMouseDown={preventBlur}
        onClick={onDismiss}
        aria-label={copy.dismiss}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
