import { memo } from "react";
import type React from "react";
import { LatexCodeEditor, type LatexCodeEditorHandle } from "@/components/latex-code-editor";
import type { EditorSelectionContext, SelectionAnchor } from "@/lib/editor-selection-anchor";
import type { SynctexWordHighlight } from "@/lib/synctex-highlight";
import type { InlineSuggestionInput } from "@/lib/inline-suggestion";

export const LatexEditor = memo(function LatexEditor({
  latex,
  onLatexChange,
  onSelectionChange,
  onSelectionContextChange,
  onQuickEditRequest,
  fullHeight = false,
  highlightLine = null,
  synctexHighlight = null,
  inlineSuggestion = null,
  editorRef,
}: {
  latex: string;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  onSelectionContextChange?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor } | null,
  ) => void;
  onQuickEditRequest?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor },
  ) => void;
  fullHeight?: boolean;
  highlightLine?: number | null;
  synctexHighlight?: SynctexWordHighlight | null;
  inlineSuggestion?: InlineSuggestionInput | null;
  editorRef?: React.Ref<LatexCodeEditorHandle>;
}) {
  return (
    <LatexCodeEditor
      ref={editorRef}
      latex={latex}
      onLatexChange={onLatexChange}
      onSelectionChange={onSelectionChange}
      onSelectionContextChange={onSelectionContextChange}
      onQuickEditRequest={onQuickEditRequest}
      fullHeight={fullHeight}
      highlightLine={highlightLine}
      synctexHighlight={synctexHighlight}
      inlineSuggestion={
        inlineSuggestion
          ? {
              originalText: inlineSuggestion.originalText,
              suggestion: inlineSuggestion.suggestion,
              applyMode: inlineSuggestion.applyMode,
              selectionStart: inlineSuggestion.selectionStart,
              selectionEnd: inlineSuggestion.selectionEnd,
            }
          : null
      }
    />
  );
});
