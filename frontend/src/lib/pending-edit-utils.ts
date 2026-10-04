/** Fingerprint + stale detection for human-gated pending edits. */

export type PendingEditLike = {
  file: string;
  applyMode: "selection" | "document";
  originalText: string;
  replacementText: string;
  selectionStart?: number;
  selectionEnd?: number;
  sourceFingerprint?: string;
};

/** Fast deterministic fingerprint (djb2) for file content at proposal time. */
export function contentFingerprint(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/** True when the target file changed since the edit was proposed. */
export function isPendingEditStale(edit: PendingEditLike, currentContent: string): boolean {
  if (!edit.sourceFingerprint) return false;
  const currentFp = contentFingerprint(currentContent);
  if (currentFp === edit.sourceFingerprint) return false;

  if (
    edit.applyMode === "selection" &&
    edit.selectionStart != null &&
    edit.selectionEnd != null &&
    edit.selectionEnd > edit.selectionStart &&
    edit.selectionEnd <= currentContent.length
  ) {
    const slice = currentContent.slice(edit.selectionStart, edit.selectionEnd);
    return slice !== edit.originalText;
  }

  if (edit.applyMode === "document") {
    return true;
  }

  return !currentContent.includes(edit.originalText);
}

export function canApplyPendingEdit(edit: PendingEditLike, currentContent: string): boolean {
  return !isPendingEditStale(edit, currentContent);
}
