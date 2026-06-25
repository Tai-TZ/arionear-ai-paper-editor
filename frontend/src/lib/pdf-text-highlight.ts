const HIGHLIGHT_CLASS = "pdf-highlight";

export function clearPdfHighlights(root: ParentNode) {
  root.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
}

/**
 * Highlight the first occurrence of `query` in a PDF.js text layer.
 * Uses case-insensitive substring matching across all spans joined together.
 * Returns the first highlighted span (for scrollIntoView), or null if not found.
 */
export function highlightPdfTextLayer(
  textLayer: HTMLElement,
  query: string,
): HTMLElement | null {
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
