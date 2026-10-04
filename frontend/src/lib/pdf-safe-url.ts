/** Protocols a link inside a compiled (user-authored) PDF may navigate to. */
const SAFE_PDF_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Normalised URL when an external PDF link is safe to make clickable, else null.
 *
 * PDFs are compiled from user LaTeX, so `\href{javascript:...}` (or data:, vbscript:, file: ...)
 * must never become an anchor href. Parsing with `URL` also defeats case/whitespace tricks.
 */
export function safeExternalPdfUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  return SAFE_PDF_LINK_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
}
