import type { DefensePdfCitation } from "@/lib/defense-pdf-links";
import {
  extractLatexPassages,
  findPassageById,
  findPassageByTitleHint,
  type LatexPassage,
} from "@/lib/defense-latex-passages";

export type ResolvedDefensePdfCitation = {
  /** Primary text to locate in the PDF. */
  locateText: string;
  /** Section heading variants to try (IEEE-style titles, ALL CAPS, etc.). */
  headingCandidates: string[];
  /** Section heading when known. */
  title?: string;
  page?: number;
  /** Navigate to a section heading rather than a body excerpt. */
  isSection: boolean;
};

const TITLE_SYNONYM_GROUPS = [
  ["methods", "methodology", "approach"],
  ["experiments", "experimental", "results", "evaluation"],
  ["introduction", "intro"],
  ["conclusion", "conclusions"],
  ["related work", "related works", "literature", "background"],
];

function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function synonymVariants(title: string): string[] {
  const norm = normalizeHeading(title);
  const group = TITLE_SYNONYM_GROUPS.find((items) => items.includes(norm));
  return group ?? [norm];
}

/** Build PDF heading search strings from a LaTeX section title. */
function buildSectionHeadingCandidates(title: string): string[] {
  const cleaned = title.trim();
  if (!cleaned) return [];

  const variants = new Set<string>();
  for (const synonym of synonymVariants(cleaned)) {
    const words = synonym
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9-]/gi, ""))
      .filter(Boolean);
    if (!words.length) continue;

    const titleCase = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const upper = words.join(" ").toUpperCase();

    variants.add(titleCase);
    variants.add(upper);
    variants.add(words.join(" "));

    for (const num of ["I", "II", "III", "IV", "V", "VI", "VII"]) {
      variants.add(`${num}. ${upper}`);
      variants.add(`${num}. ${titleCase}`);
    }
  }

  variants.add(cleaned);
  variants.add(cleaned.toUpperCase());

  return [...variants].sort((a, b) => b.length - a.length);
}

function resolvePassageCitation(
  passage: LatexPassage,
  citation: DefensePdfCitation,
): ResolvedDefensePdfCitation {
  const headingCandidates = buildSectionHeadingCandidates(passage.title);
  const explicitQuote = citation.quote?.trim();

  if (explicitQuote && explicitQuote.length >= 40 && !citation.passageId) {
    return {
      locateText: explicitQuote,
      headingCandidates: [],
      title: passage.title,
      page: citation.page,
      isSection: false,
    };
  }

  return {
    locateText: passage.title,
    headingCandidates,
    title: passage.title,
    page: citation.page,
    isSection: true,
  };
}

export function resolveDefensePdfCitation(
  citation: DefensePdfCitation,
  latex: string,
): ResolvedDefensePdfCitation {
  const passages = extractLatexPassages(latex);

  if (citation.passageId) {
    const passage = findPassageById(passages, citation.passageId);
    if (passage) return resolvePassageCitation(passage, citation);
  }

  if (citation.quote?.trim() && citation.quote.trim().length >= 40) {
    return {
      locateText: citation.quote.trim(),
      headingCandidates: [],
      page: citation.page,
      isSection: false,
    };
  }

  const legacySearch = citation.search.trim();
  const byTitle = findPassageByTitleHint(passages, legacySearch);
  if (byTitle) {
    return resolvePassageCitation(byTitle, citation);
  }

  const headingCandidates =
    legacySearch.split(/\s+/).length <= 4
      ? buildSectionHeadingCandidates(legacySearch)
      : [];

  return {
    locateText: legacySearch,
    headingCandidates,
    page: citation.page,
    isSection: headingCandidates.length > 0,
  };
}
