export type SynctexWordHighlight = {
  line: number;
  start: number;
  end: number;
};

const WORD_CHAR = /[\p{L}\p{N}_'-]/u;

function normalizePdfWord(raw: string): string {
  return raw
    .replace(/[\u00AD\u200B\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a PDF word + optional synctex column to a source line character range. */
export function findWordRangeOnLine(
  line: string,
  word: string,
  column?: number,
): { start: number; end: number } | null {
  const needle = normalizePdfWord(word);
  if (!needle) return null;

  const matches: number[] = [];
  const lowerLine = line.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let pos = 0;
  while (pos < line.length) {
    const idx = lowerLine.indexOf(lowerNeedle, pos);
    if (idx === -1) break;
    matches.push(idx);
    pos = idx + 1;
  }
  if (matches.length === 0) return null;

  let start = matches[0];
  if (column != null && column >= 0) {
    start = matches.reduce((best, idx) =>
      Math.abs(idx - column) < Math.abs(best - column) ? idx : best,
    );
  }

  return { start, end: start + needle.length };
}

function normalizeMatchText(text: string): string {
  return text
    .replace(/\\[a-zA-Z*]+\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z*]+/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function resolveLineByContext(
  latex: string,
  context: string,
  synctexLine: number,
  word: string,
): number | null {
  const ctx = normalizeMatchText(normalizePdfWord(context));
  if (ctx.length < 8) return null;

  const needle = word.trim().toLowerCase();
  const words = ctx.split(" ").filter(Boolean);
  const lines = latex.split(/\r?\n/);

  for (let length = words.length; length >= 2; length -= 1) {
    for (let start = 0; start <= words.length - length; start += 1) {
      const phrase = words.slice(start, start + length).join(" ");
      if (phrase.length < 8) continue;
      if (needle && !phrase.includes(needle)) continue;

      const hits: number[] = [];
      for (let idx = 0; idx < lines.length; idx += 1) {
        if (normalizeMatchText(lines[idx] ?? "").includes(phrase)) hits.push(idx + 1);
      }
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) {
        return hits.reduce((best, lineNo) =>
          Math.abs(lineNo - synctexLine) < Math.abs(best - synctexLine) ? lineNo : best,
        );
      }
    }
  }

  return null;
}

/** If synctex line is off (common with macros), search for the word in the source. */
export function resolveSynctexWordHighlight(
  latex: string,
  line: number,
  word?: string,
  column?: number,
  searchRadius = 5,
  context?: string,
): SynctexWordHighlight | null {
  const needle = word ? normalizePdfWord(word) : "";
  if (!needle) return null;

  const lines = latex.split(/\r?\n/);

  const contextLine = context
    ? resolveLineByContext(latex, context, line, needle)
    : null;
  if (contextLine != null) {
    const range = findWordRangeOnLine(lines[contextLine - 1] ?? "", needle, column);
    if (range) {
      return { line: contextLine, start: range.start, end: range.end };
    }
  }

  const globalMatches: SynctexWordHighlight[] = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const range = findWordRangeOnLine(lines[idx] ?? "", needle, column);
    if (range) globalMatches.push({ line: idx + 1, start: range.start, end: range.end });
  }
  if (globalMatches.length === 1) return globalMatches[0];

  if (globalMatches.length > 1) {
    return globalMatches.reduce((best, hit) =>
      Math.abs(hit.line - line) < Math.abs(best.line - line) ? hit : best,
    );
  }

  const indices: number[] = [];
  for (let d = 0; d <= searchRadius; d += 1) {
    const above = line - 1 - d;
    const below = line - 1 + d;
    if (above >= 0) indices.push(above);
    if (d > 0 && below < lines.length) indices.push(below);
  }

  for (const idx of indices) {
    const range = findWordRangeOnLine(lines[idx] ?? "", needle, column);
    if (range) {
      return { line: idx + 1, start: range.start, end: range.end };
    }
  }
  return null;
}

/** Resolve SyncTeX line to the source line that actually contains the clicked word. */
export function resolveSynctexLine(
  latex: string,
  line: number,
  word?: string,
  column?: number,
  context?: string,
): number {
  return resolveSynctexWordHighlight(latex, line, word, column, 5, context)?.line ?? line;
}

function wordFromTextNode(text: string, offset: number): string | null {
  if (!text) return null;
  let start = Math.min(offset, text.length);
  let end = start;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start -= 1;
  while (end < text.length && WORD_CHAR.test(text[end])) end += 1;
  const word = normalizePdfWord(text.slice(start, end));
  return word || null;
}

function wordFromElementsAtPoint(
  clientX: number,
  clientY: number,
  textLayer: HTMLElement,
): string | null {
  const elements = document.elementsFromPoint(clientX, clientY);
  const chunks: string[] = [];

  for (const el of elements) {
    if (!textLayer.contains(el)) continue;
    const span = el.closest("span");
    if (!span || !textLayer.contains(span)) continue;
    const t = span.textContent ?? "";
    if (t.trim()) chunks.push(t);
  }

  if (chunks.length === 0) return null;

  const merged = normalizePdfWord(chunks.join(""));
  if (merged && WORD_CHAR.test(merged)) return merged;

  const single = normalizePdfWord(chunks[0] ?? "");
  return single || null;
}

/** Read the word under a PDF text-layer double-click (Overleaf-style). */
export function extractWordAtPoint(
  clientX: number,
  clientY: number,
  textLayer: HTMLElement | null,
): string | null {
  if (!textLayer) return null;

  const selection = window.getSelection();
  const selected = normalizePdfWord(selection?.toString() ?? "");
  if (selected && !selected.includes("\n") && selected.length > 0 && selected.length < 120) {
    return selected;
  }

  const fromElements = wordFromElementsAtPoint(clientX, clientY, textLayer);
  if (fromElements) return fromElements;

  const target = document.elementFromPoint(clientX, clientY);
  if (!target || !textLayer.contains(target)) return null;

  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const range = doc.caretRangeFromPoint?.(clientX, clientY);
  if (range && textLayer.contains(range.startContainer)) {
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const word = wordFromTextNode(node.textContent ?? "", range.startOffset);
      if (word) return word;
    }
  }

  const spanText = normalizePdfWord(target.closest("span")?.textContent ?? "");
  if (spanText && WORD_CHAR.test(spanText)) return spanText;

  return null;
}

/** Wait for browser double-click word selection (timing varies by engine). */
export function capturePdfClickWord(
  clientX: number,
  clientY: number,
  textLayer: HTMLElement | null,
): Promise<string | undefined> {
  const read = () => extractWordAtPoint(clientX, clientY, textLayer) ?? undefined;

  return new Promise((resolve) => {
    const attempts = [0, 1, 2, 40];
    let i = 0;

    const tryRead = () => {
      const word = read();
      if (word || i >= attempts.length - 1) {
        resolve(word);
        return;
      }
      const delay = attempts[i];
      i += 1;
      if (delay <= 2) {
        requestAnimationFrame(tryRead);
      } else {
        window.setTimeout(tryRead, delay);
      }
    };

    tryRead();
  });
}
