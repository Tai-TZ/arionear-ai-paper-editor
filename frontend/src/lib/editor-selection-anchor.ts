export type EditorSelectionContext = {
  text: string;
  start: number;
  end: number;
  lineStart: number;
  lineEnd: number;
};

export type SelectionAnchor = {
  top: number;
  left: number;
};

function lineColAtOffset(value: string, offset: number): { line: number; col: number } {
  const before = value.slice(0, offset);
  const line = before.split(/\r?\n/).length;
  const lastNl = before.lastIndexOf("\n");
  const col = offset - (lastNl >= 0 ? lastNl + 1 : 0);
  return { line, col };
}

function measurePrefixWidth(textarea: HTMLTextAreaElement, prefix: string): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return prefix.length * 7.8;
  const style = getComputedStyle(textarea);
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText(prefix.replace(/\t/g, "    ")).width;
}

/** Caret anchor at end of selection, relative to textarea padding box (scroll-adjusted). */
export function getSelectionAnchor(
  textarea: HTMLTextAreaElement,
  selectionEnd: number,
): SelectionAnchor {
  const value = textarea.value;
  const { line, col } = lineColAtOffset(value, selectionEnd);
  const lines = value.split(/\r?\n/);
  const lineText = (lines[line - 1] ?? "").slice(0, col);

  const style = getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || 21.45;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;

  return {
    top: paddingTop + (line - 1) * lineHeight - textarea.scrollTop,
    left: paddingLeft + measurePrefixWidth(textarea, lineText) - textarea.scrollLeft,
  };
}

export function readEditorSelection(
  textarea: HTMLTextAreaElement,
): { context: EditorSelectionContext; anchor: SelectionAnchor } | null {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  if (start === end) return null;

  const text = textarea.value.slice(start, end);
  if (!text.trim()) return null;

  const startPos = lineColAtOffset(textarea.value, start);
  const endPos = lineColAtOffset(textarea.value, end);

  return {
    context: {
      text,
      start,
      end,
      lineStart: startPos.line,
      lineEnd: endPos.line,
    },
    anchor: getSelectionAnchor(textarea, end),
  };
}
