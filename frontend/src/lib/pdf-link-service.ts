import type { PDFDocumentProxy } from "pdfjs-dist";

/** Minimal link service so PDF.js annotation layer can navigate internal citations. */
export class PdfLinkService {
  pdfDocument: PDFDocumentProxy | null = null;
  externalLinkEnabled = true;
  rotation = 0;

  private currentPage = 1;

  constructor(private readonly onScrollToPage: (page: number) => void) {}

  setDocument(pdf: PDFDocumentProxy | null) {
    this.pdfDocument = pdf;
    this.currentPage = 1;
  }

  setCurrentPage(page: number) {
    this.currentPage = page;
  }

  get pagesCount() {
    return this.pdfDocument?.numPages ?? 0;
  }

  get page() {
    return this.currentPage;
  }

  set page(value: number) {
    const clamped = Math.max(1, Math.min(value, this.pagesCount || value));
    this.currentPage = clamped;
    this.onScrollToPage(clamped);
  }

  get isInPresentationMode() {
    return false;
  }

  async goToDestination(dest: string | unknown[]) {
    const pdf = this.pdfDocument;
    if (!pdf) return;

    let explicitDest: unknown;
    if (typeof dest === "string") {
      explicitDest = await pdf.getDestination(dest);
    } else {
      explicitDest = dest;
    }

    if (!Array.isArray(explicitDest)) return;

    const [destRef] = explicitDest;
    let pageNumber: number | null = null;

    if (destRef && typeof destRef === "object") {
      pageNumber = pdf.cachedPageNumber(destRef as { num: number; gen: number }) ?? null;
      if (!pageNumber) {
        try {
          pageNumber = (await pdf.getPageIndex(destRef as { num: number; gen: number })) + 1;
        } catch {
          return;
        }
      }
    } else if (Number.isInteger(destRef)) {
      pageNumber = (destRef as number) + 1;
    }

    if (!pageNumber || pageNumber < 1 || pageNumber > this.pagesCount) return;
    this.page = pageNumber;
  }

  /** Part of IPDFLinkService; the annotation layer never calls it, so page-level navigation is enough. */
  goToXY(pageNumber: number, _x: number, _y: number) {
    this.goToPage(pageNumber);
  }

  goToPage(val: number | string) {
    const pageNumber = typeof val === "string" ? Number.parseInt(val, 10) : val;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pagesCount) return;
    this.page = pageNumber;
  }

  addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow = false) {
    if (!url) return;

    const internalDest = parseInternalPdfLink(url);
    if (internalDest && !newWindow) {
      link.href = "#";
      link.title = internalDest;
      link.onclick = (event) => {
        event.preventDefault();
        void this.goToDestination(internalDest);
        return false;
      };
      return;
    }

    if (this.externalLinkEnabled) {
      link.href = url;
      link.title = url;
    } else {
      link.href = "";
      link.title = `Disabled: ${url}`;
      link.onclick = () => false;
    }
    if (newWindow) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }

  getDestinationHash(dest: unknown) {
    if (typeof dest === "string" && dest.length > 0) {
      return this.getAnchorUrl(`#${escape(dest)}`);
    }
    if (Array.isArray(dest)) {
      const str = JSON.stringify(dest);
      if (str.length > 0) return this.getAnchorUrl(`#${escape(str)}`);
    }
    return this.getAnchorUrl("");
  }

  getAnchorUrl(anchor: string) {
    return anchor;
  }

  setHash(hash: string) {
    if (!this.pdfDocument || !hash) return;

    if (hash.includes("nameddest=")) {
      const match = hash.match(/nameddest=([^&]+)/);
      if (match?.[1]) {
        void this.goToDestination(decodeURIComponent(match[1]));
      }
      return;
    }

    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    const decoded = decodeURIComponent(raw);
    if (decoded) {
      void this.goToDestination(decoded);
    }
  }

  executeNamedAction() {
    /* not used for citation links */
  }

  executeSetOCGState() {
    return Promise.resolve();
  }
}

/** hyperref emits URI links like "#cite.key" — treat as named PDF destinations, not browser hash. */
export function parseInternalPdfLink(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed) || trimmed.startsWith("mailto:")) {
    return null;
  }
  if (trimmed.startsWith("#")) {
    const dest = decodeURIComponent(trimmed.slice(1));
    return dest || null;
  }
  if (
    trimmed.startsWith("cite.") ||
    trimmed.startsWith("section.") ||
    trimmed.startsWith("figure.") ||
    trimmed.startsWith("table.") ||
    trimmed.startsWith("equation.") ||
    trimmed.startsWith("page.")
  ) {
    return decodeURIComponent(trimmed);
  }
  return null;
}
