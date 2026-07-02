import type { InlineSuggestionInput } from "@/lib/inline-suggestion";
import type { PendingEdit, PendingSuggestion } from "../types";

export function toInlineSuggestion(
  pendingEdits: PendingEdit[] | null | undefined,
  activeEditId: string | null | undefined,
  pendingSuggestion: PendingSuggestion | null | undefined,
): InlineSuggestionInput | null {
  const withSelectionScope = (input: {
    originalText: string;
    suggestion: string;
    applyMode?: "selection" | "document";
    selectionStart?: number;
    selectionEnd?: number;
  }) => {
    const hasAnchor =
      input.selectionStart != null &&
      input.selectionEnd != null &&
      input.selectionEnd > input.selectionStart;
    return hasAnchor ? { ...input, applyMode: "selection" as const } : input;
  };

  if (pendingEdits?.length) {
    const edit = pendingEdits.find((e) => e.id === activeEditId) ?? pendingEdits[0];
    return withSelectionScope({
      originalText: edit.originalText,
      suggestion: edit.replacementText,
      applyMode: edit.applyMode,
      selectionStart: edit.selectionStart,
      selectionEnd: edit.selectionEnd,
    });
  }
  if (pendingSuggestion) {
    return withSelectionScope({
      originalText: pendingSuggestion.originalText,
      suggestion: pendingSuggestion.suggestion,
      applyMode: pendingSuggestion.applyMode,
      selectionStart: pendingSuggestion.selectionStart,
      selectionEnd: pendingSuggestion.selectionEnd,
    });
  }
  return null;
}
