import { diffWords, type DiffPart } from "@/lib/text-diff";

export type InlineSuggestionInput = {
  originalText: string;
  suggestion: string;
  applyMode?: string;
};

export type SuggestionViewLine =
  | { kind: "normal"; text: string; lineNo: number }
  | { kind: "diff"; parts: DiffPart[]; lineNo: number };

export type InlineSuggestionView = {
  previewLatex: string;
  lines: SuggestionViewLine[];
  changeStartLine: number;
  changeEndLine: number;
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function findOriginalRange(
  latex: string,
  originalText: string,
  applyMode?: string,
): { start: number; end: number; matched: string } | null {
  if (applyMode === "document") {
    return { start: 0, end: latex.length, matched: latex };
  }

  const needle = originalText.trim();
  if (!needle) return null;

  const direct = latex.indexOf(originalText);
  if (direct >= 0) {
    return { start: direct, end: direct + originalText.length, matched: originalText };
  }

  const trimmed = latex.indexOf(needle);
  if (trimmed >= 0) {
    return { start: trimmed, end: trimmed + needle.length, matched: needle };
  }

  const normLatex = normalizeWhitespace(latex);
  const normNeedle = normalizeWhitespace(needle);
  const normIdx = normLatex.indexOf(normNeedle);
  if (normIdx < 0) return null;

  const words = needle.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0];
  const last = words[words.length - 1];
  const start = latex.indexOf(first);
  if (start < 0) return null;
  const endSearch = latex.indexOf(last, start);
  if (endSearch < 0) return null;
  const end = endSearch + last.length;
  return { start, end, matched: latex.slice(start, end) };
}

function offsetToLine(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

function sliceDiffPartsForLine(
  parts: DiffPart[],
  lineStart: number,
  lineEnd: number,
): DiffPart[] {
  const sliced: DiffPart[] = [];
  let cursor = 0;

  for (const part of parts) {
    const partStart = cursor;
    const partEnd = cursor + part.text.length;
    cursor = partEnd;

    if (partEnd <= lineStart || partStart >= lineEnd) continue;

    const sliceStart = Math.max(0, lineStart - partStart);
    const sliceEnd = Math.min(part.text.length, lineEnd - partStart);
    const text = part.text.slice(sliceStart, sliceEnd);
    if (text) sliced.push({ type: part.type, text });
  }

  return sliced;
}

export function buildInlineSuggestionView(
  latex: string,
  input: InlineSuggestionInput,
): InlineSuggestionView | null {
  const originalText = input.originalText ?? "";
  const suggestion = input.suggestion ?? "";
  if (!suggestion.trim()) return null;

  const range = findOriginalRange(latex, originalText, input.applyMode);
  if (!range) return null;

  const previewLatex =
    latex.slice(0, range.start) + suggestion + latex.slice(range.end);
  const changeStart = range.start;
  const changeEnd = range.start + suggestion.length;
  const diffParts = diffWords(range.matched, suggestion);

  const previewLines = previewLatex.split("\n");
  let charOffset = 0;
  const lines: SuggestionViewLine[] = [];

  for (let i = 0; i < previewLines.length; i += 1) {
    const lineText = previewLines[i];
    const lineStart = charOffset;
    const lineEnd = charOffset + lineText.length;
    const lineNo = i + 1;

    const overlapsChange = lineEnd > changeStart && lineStart < changeEnd;
    if (overlapsChange) {
      const parts = sliceDiffPartsForLine(diffParts, lineStart, lineEnd);
      lines.push({
        kind: "diff",
        parts: parts.length > 0 ? parts : [{ type: "equal", text: lineText }],
        lineNo,
      });
    } else {
      lines.push({ kind: "normal", text: lineText, lineNo });
    }

    charOffset = lineEnd + 1;
  }

  return {
    previewLatex,
    lines,
    changeStartLine: offsetToLine(previewLatex, changeStart),
    changeEndLine: offsetToLine(previewLatex, Math.max(changeEnd - 1, changeStart)),
  };
}
