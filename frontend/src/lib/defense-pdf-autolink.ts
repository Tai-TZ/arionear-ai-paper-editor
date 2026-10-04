/**
 * Auto-link defense council replies to PDF search terms.
 *
 * Simple contract: every link is `[label](#pdf?search=<text>)` where <text>
 * is the actual string to find (case-insensitively) in the compiled PDF.
 * No passage slugs, no excerpt extraction — just search terms.
 */

import { isValidPdfCitationSearch, PDF_CITATION_STOPWORDS } from "@/lib/defense-pdf-stopwords";

// ── LaTeX term extraction ────────────────────────────────────────────────────

function cleanLatexFragment(raw: string): string {
  return raw
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}\\$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinkableTermsFromLatex(latex: string): string[] {
  if (!latex.trim()) return [];

  const terms = new Set<string>();
  const sectionRe = /\\(?:section|subsection|subsubsection|chapter)\*?\{([^}]+)\}/gi;
  const boldRe = /\\(?:textbf|emph|textit)\{([^}]+)\}/gi;
  const camelRe = /\b[A-Za-z][A-Za-z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b/g;
  const techRe =
    /\b(?:EfficientNet(?:V2)?|PubMedBERT|BioBERT|BERT|adapters?|bottleneck|macro[- ]?F1|F1[- ]?score|transformers?|NER|Biomedical)\b/gi;

  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(latex)) !== null) {
    const c = cleanLatexFragment(m[1]);
    if (c.length >= 3 && c.length <= 80) terms.add(c);
  }
  while ((m = boldRe.exec(latex)) !== null) {
    const c = cleanLatexFragment(m[1]);
    if (c.length >= 3 && c.length <= 60) terms.add(c);
  }
  while ((m = camelRe.exec(latex)) !== null) {
    if (m[0].length >= 4) terms.add(m[0]);
  }
  while ((m = techRe.exec(latex)) !== null) {
    terms.add(m[0]);
  }

  return [...terms]
    .filter((t) => !PDF_CITATION_STOPWORDS.has(t.toLowerCase()) && isValidPdfCitationSearch(t))
    .sort((a, b) => b.length - a.length);
}

// ── Sanitize ─────────────────────────────────────────────────────────────────

const PDF_LINK_RE = /\[([^\]]+)\]\(#pdf\?([^)]*)\)/g;

/**
 * Strip links the model emitted with bad/stopword search terms.
 * Also normalises `passage=slug` to `search=slug` so the rest of the
 * pipeline can treat everything uniformly.
 */
function sanitizeDefensePdfLinks(content: string): string {
  return content.replace(PDF_LINK_RE, (full, label: string, queryString: string) => {
    const params = new URLSearchParams(queryString);
    // Passage slug links → treat the slug as a fallback search term
    const passageId = params.get("passage")?.trim();
    if (passageId) {
      return isValidPdfCitationSearch(passageId)
        ? `[${label}](#pdf?search=${encodeURIComponent(passageId)})`
        : label;
    }
    const search = params.get("search")?.trim();
    if (!search || !isValidPdfCitationSearch(search)) return label;
    return full;
  });
}

// ── Auto-link ─────────────────────────────────────────────────────────────────

/**
 * Vietnamese phrase → ordered list of candidate search terms.
 * The first candidate that passes `isValidPdfCitationSearch` wins.
 */
const VI_PHRASE_RULES: Array<{ pattern: RegExp; candidates: string[] }> = [
  {
    pattern: /\bphần thí nghiệm\b/giu,
    candidates: ["Experiments", "Experimental", "Results", "Evaluation"],
  },
  {
    pattern: /\bphương pháp(?: nghiên cứu)?\b/giu,
    candidates: ["Methodology", "Methods", "Approach"],
  },
  {
    pattern: /\bkết quả\b/giu,
    candidates: ["Results", "Findings", "Evaluation"],
  },
  {
    pattern: /\bphần giới thiệu\b/giu,
    candidates: ["Introduction"],
  },
  {
    pattern: /\bphần kết luận\b/giu,
    candidates: ["Conclusion"],
  },
];

function alreadyLinked(text: string, search: string): boolean {
  return text.toLowerCase().includes(`search=${search.toLowerCase()}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap the first appearance of known paper terms with `#pdf?search=` links. */
function autolinkDefenseTerms(content: string, latexTerms: string[]): string {
  if (!content.trim() || latexTerms.length === 0) return content;

  let out = content;

  for (const term of latexTerms) {
    if (!isValidPdfCitationSearch(term) || alreadyLinked(out, term)) continue;
    const re = new RegExp(`(?<!\\[)\\b(${escapeRegExp(term)})\\b(?![^[]*\\]\\()`, "i");
    if (re.test(out)) {
      out = out.replace(
        re,
        (_, hit: string) => `[${hit}](#pdf?search=${encodeURIComponent(term)})`,
      );
    }
  }

  for (const rule of VI_PHRASE_RULES) {
    const candidate = rule.candidates.find(isValidPdfCitationSearch);
    if (!candidate || alreadyLinked(out, candidate)) continue;
    if (!rule.pattern.test(out)) continue;
    rule.pattern.lastIndex = 0;
    out = out.replace(
      rule.pattern,
      (hit) => `[${hit}](#pdf?search=${encodeURIComponent(candidate)})`,
    );
    rule.pattern.lastIndex = 0;
  }

  return out;
}

export function prepareDefenseCouncilMarkdown(content: string, latex: string): string {
  const sanitized = sanitizeDefensePdfLinks(content);
  const terms = extractLinkableTermsFromLatex(latex);
  return autolinkDefenseTerms(sanitized, terms);
}
