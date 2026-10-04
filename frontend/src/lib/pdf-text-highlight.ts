const HIGHLIGHT_CLASS = "pdf-highlight";
const ACTIVE_HIGHLIGHT_CLASS = "pdf-highlight-active";

export function clearPdfHighlights(root: ParentNode) {
  root.querySelectorAll(`.${HIGHLIGHT_CLASS}, .${ACTIVE_HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS, ACTIVE_HIGHLIGHT_CLASS);
  });
}

/**
 * Highlight the first occurrence of `query` in a PDF.js text layer.
 * Uses case-insensitive substring matching across all spans joined together.
 * Returns the first highlighted span (for scrollIntoView), or null if not found.
 */
export function highlightPdfTextLayer(textLayer: HTMLElement, query: string): HTMLElement | null {
  const needle = query.trim();
  if (!needle) return null;

  clearPdfHighlights(textLayer);

  const spans = Array.from(textLayer.querySelectorAll("span"));
  if (!spans.length) return null;

  // Join all span text to find the match position across span boundaries
  const fullText = spans.map((s) => s.textContent ?? "").join("");
  const idx = fullText.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return null;

  const endIdx = idx + needle.length;
  let pos = 0;
  let first: HTMLElement | null = null;

  for (const span of spans) {
    const len = (span.textContent ?? "").length;
    if (pos + len > idx && pos < endIdx) {
      span.classList.add(HIGHLIGHT_CLASS);
      if (!first) first = span;
    }
    pos += len;
  }

  return first;
}

/**
 * Highlight all occurrences of `query` on a page; mark the `occurrenceOnPage`-th (0-based) as active.
 * Returns the first span of the active occurrence for scrollIntoView.
 */
export function highlightPdfTextLayerOccurrence(
  textLayer: HTMLElement,
  query: string,
  occurrenceOnPage = 0,
): HTMLElement | null {
  const needle = query.trim();
  if (!needle) return null;

  clearPdfHighlights(textLayer);

  const spans = Array.from(textLayer.querySelectorAll("span"));
  if (!spans.length) return null;

  const fullText = spans.map((s) => s.textContent ?? "").join("");
  const lower = fullText.toLowerCase();
  const needleLower = needle.toLowerCase();

  const occurrences: { start: number; end: number }[] = [];
  let scan = 0;
  while (true) {
    const idx = lower.indexOf(needleLower, scan);
    if (idx < 0) break;
    occurrences.push({ start: idx, end: idx + needle.length });
    scan = idx + needle.length;
  }
  if (!occurrences.length) return null;

  const activeIdx = Math.min(Math.max(0, occurrenceOnPage), occurrences.length - 1);
  let charPos = 0;
  let firstActive: HTMLElement | null = null;

  for (const span of spans) {
    const len = (span.textContent ?? "").length;
    const spanStart = charPos;
    const spanEnd = charPos + len;

    occurrences.forEach((occ, oi) => {
      if (spanEnd > occ.start && spanStart < occ.end) {
        span.classList.add(HIGHLIGHT_CLASS);
        if (oi === activeIdx) {
          span.classList.add(ACTIVE_HIGHLIGHT_CLASS);
          if (!firstActive) firstActive = span;
        }
      }
    });
    charPos += len;
  }

  return firstActive;
}
