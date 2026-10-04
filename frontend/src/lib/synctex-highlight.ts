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
function extractWordAtPoint(
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
