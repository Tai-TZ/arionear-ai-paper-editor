export type DiffLineKind = "normal" | "del" | "ins";

export type InlineSuggestionInput = {
  originalText: string;
  suggestion: string;
  applyMode?: string;
  selectionStart?: number;
  selectionEnd?: number;
};

export type SuggestionViewLine = { kind: DiffLineKind; text: string; lineNo: number };

export type InlineSuggestionView = {
  displayLatex: string;
  lines: SuggestionViewLine[];
  changeStartLine: number;
  changeEndLine: number;
};

function findOriginalRange(
  latex: string,
  originalText: string,
  applyMode?: string,
  selectionRange?: { start: number; end: number },
): { start: number; end: number; matched: string } | null {
  if (
    selectionRange &&
    selectionRange.end > selectionRange.start &&
    selectionRange.start >= 0 &&
    selectionRange.end <= latex.length
  ) {
    const { start, end } = selectionRange;
    return { start, end, matched: latex.slice(start, end) };
  }

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

  return null;
}

function offsetToLine(text: string, offset: number): number {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

function splitLinesKeepEmpty(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().match(/\w+/g) ?? []);
  const wordsB = new Set(b.toLowerCase().match(/\w+/g) ?? []);
  if (!wordsA.size || !wordsB.size) return 0;
  let shared = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) shared += 1;
  }
  return shared / Math.max(wordsA.size, wordsB.size);
}

function bestMatchingLine(original: string, suggestion: string): string | null {
  const orig = original.trim();
  if (!orig) return null;
  const lines = suggestion
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const cmd = orig.match(/^(\\[a-zA-Z@*]+)/)?.[1];
  if (cmd) {
    const sameCmd = lines.find((line) => line.startsWith(cmd));
    if (sameCmd) return sameCmd;
  }

  let best = "";
  let bestScore = 0;
  for (const line of lines) {
    const score = wordOverlap(line, orig);
    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }
  if (bestScore >= 0.15) return best;
  return lines.length === 1 ? lines[0] : null;
}

/** Strip full-document LLM leakage when previewing a selection edit. */
export function clampSelectionReplacement(original: string, suggestion: string): string {
  const orig = original.trim();
  const sugg = suggestion.trim();
  if (!orig || !sugg) return sugg;

  const leaked = /\\documentclass\b/i.test(sugg) || /\\begin\{document\}/i.test(sugg);
  const origLines = Math.max(1, orig.split("\n").length);
  const suggLines = Math.max(1, sugg.split("\n").length);
  const oversized =
    suggLines > origLines + 1 || sugg.length > Math.max(orig.length * 3, orig.length + 120);

  if (leaked || oversized) {
    return bestMatchingLine(orig, sugg) ?? orig;
  }
  return sugg;
}

export function buildInlineSuggestionView(
  latex: string,
  input: InlineSuggestionInput,
): InlineSuggestionView | null {
  const originalText = input.originalText ?? "";
  const suggestion = input.suggestion ?? "";
  if (!suggestion.trim()) return null;

  const selectionRange =
    input.selectionStart != null &&
    input.selectionEnd != null &&
    input.selectionEnd > input.selectionStart
      ? { start: input.selectionStart, end: input.selectionEnd }
      : undefined;

  const range = findOriginalRange(latex, originalText, input.applyMode, selectionRange);
  if (!range) return null;

  const suggestionScoped = selectionRange
    ? clampSelectionReplacement(range.matched, suggestion)
    : suggestion;

  const before = latex.slice(0, range.start);
  const after = latex.slice(range.end);

  const originalLines = splitLinesKeepEmpty(range.matched);
  const suggestionLines = splitLinesKeepEmpty(suggestionScoped);

  // Stacked diff: original (red) then suggestion (green). Offsets drive apply on Accept.
  const displayLatex = before + range.matched + "\n" + suggestionScoped + after;
  const displayLines = displayLatex.split("\n");

  const startLine = offsetToLine(displayLatex, range.start);

  const changeStartLine = startLine;
  const changeEndLine =
    changeStartLine + Math.max(1, originalLines.length + suggestionLines.length) - 1;

  const lines: SuggestionViewLine[] = [];
  for (let i = 0; i < displayLines.length; i += 1) {
    const lineNo = i + 1;
    const text = displayLines[i] ?? "";
    if (lineNo >= changeStartLine && lineNo < changeStartLine + originalLines.length) {
      lines.push({ kind: "del", text, lineNo });
    } else if (
      lineNo >= changeStartLine + originalLines.length &&
      lineNo < changeStartLine + originalLines.length + suggestionLines.length
    ) {
      lines.push({ kind: "ins", text, lineNo });
    } else {
      lines.push({ kind: "normal", text, lineNo });
    }
  }

  return { displayLatex, lines, changeStartLine, changeEndLine };
}
