import { clampSelectionReplacement } from "@/lib/inline-suggestion";
import type { ProjectFile } from "@/lib/project-store";
import type { PendingEdit, PendingSuggestion } from "../types";

export function applySingleEdit(base: string, edit: PendingEdit): string {
  if (edit.applyMode === "document") return edit.replacementText;
  if (
    edit.selectionStart != null &&
    edit.selectionEnd != null &&
    edit.selectionEnd > edit.selectionStart &&
    edit.selectionEnd <= base.length
  ) {
    const originalSlice = base.slice(edit.selectionStart, edit.selectionEnd);
    const replacement = clampSelectionReplacement(originalSlice, edit.replacementText);
    return base.slice(0, edit.selectionStart) + replacement + base.slice(edit.selectionEnd);
  }
  if (base.includes(edit.originalText)) {
    return base.replace(edit.originalText, edit.replacementText);
  }
  return base;
}

export function suggestionToPendingEdit(
  suggestion: PendingSuggestion,
  mainFile: string,
): PendingEdit {
  return {
    id: "suggestion",
    file: suggestion.file || mainFile,
    applyMode: suggestion.applyMode ?? "selection",
    originalText: suggestion.originalText,
    replacementText: suggestion.suggestion,
    flags: suggestion.flags,
    revisionId: suggestion.revisionId,
    selectionStart: suggestion.selectionStart,
    selectionEnd: suggestion.selectionEnd,
    sourceFingerprint: suggestion.sourceFingerprint,
  };
}

export type ApplyToProjectParams = {
  edit: PendingEdit;
  activeFile: string;
  mainFile: string;
  latex: string;
  mainLatexSource: string;
  projectFiles: ProjectFile[];
};

export type ApplyToProjectResult = {
  nextActiveLatex: string | null;
  nextProjectFiles: ProjectFile[] | null;
};

/** Apply an edit/suggestion to the correct project file (active or auxiliary .tex). */
export function applyEditToProjectFiles(params: ApplyToProjectParams): ApplyToProjectResult {
  const { edit, activeFile, mainFile, latex, mainLatexSource, projectFiles } = params;
  const targetPath = edit.file || mainFile;

  if (targetPath === activeFile) {
    const next = applySingleEdit(latex, edit);
    if (next === latex) return { nextActiveLatex: null, nextProjectFiles: null };
    const nextFiles = projectFiles.map((f) =>
      f.path === activeFile ? { ...f, content: next } : f,
    );
    return { nextActiveLatex: next, nextProjectFiles: nextFiles };
  }

  const idx = projectFiles.findIndex((f) => f.path === targetPath);
  if (idx === -1) return { nextActiveLatex: null, nextProjectFiles: null };

  const updated = applySingleEdit(projectFiles[idx].content, edit);
  if (updated === projectFiles[idx].content) {
    return { nextActiveLatex: null, nextProjectFiles: null };
  }

  const nextFiles = projectFiles.map((f, i) => (i === idx ? { ...f, content: updated } : f));
  return { nextActiveLatex: null, nextProjectFiles: nextFiles };
}
