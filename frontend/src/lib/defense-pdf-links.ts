import { isValidPdfCitationSearch } from "@/lib/defense-pdf-stopwords";

/** Citation target parsed from an agent markdown link. */
export type DefensePdfCitation = {
  /** Text to search and highlight in the PDF. */
  search: string;
  page?: number;
};

/** Parse `#pdf?search=...` or `#pdf?page=2&search=...` hrefs emitted by the agent. */
export function parseDefensePdfLink(href: string): DefensePdfCitation | null {
  const raw = href.trim();
  if (!raw.startsWith("#pdf?")) return null;
  const params = new URLSearchParams(raw.slice(5));

  // Accept both search= (normal) and passage= (legacy slug the model might emit)
  const search = (params.get("search") ?? params.get("passage") ?? "").trim();
  if (!search || !isValidPdfCitationSearch(search)) return null;

  const pageRaw = params.get("page");
  const pageNum = pageRaw ? Number(pageRaw) : undefined;
  return {
    search,
    page: pageNum && Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : undefined,
  };
}

export type DefensePdfCitationFocus = DefensePdfCitation & { key: number };
