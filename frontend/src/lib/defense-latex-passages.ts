/** Structured passages extracted from LaTeX for defense PDF deep links. */

export type LatexPassage = {
  id: string;
  title: string;
  excerpt: string;
  level: number;
};

function cleanLatexFragment(raw: string): string {
  return raw
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}\\$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(title: string): string {
  return cleanLatexFragment(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stripLatexBody(raw: string): string {
  return raw
    .replace(/%.*/gm, " ")
    .replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/gi, " ")
    .replace(/\\begin\{table\*?\}[\s\S]*?\\end\{table\*?\}/gi, " ")
    .replace(/\\begin\{equation\*?\}[\s\S]*?\\end\{equation\*?\}/gi, " ")
    .replace(/\\begin\{align\*?\}[\s\S]*?\\end\{align\*?\}/gi, " ")
    .replace(/\\begin\{lstlisting\}[\s\S]*?\\end\{lstlisting\}/gi, " ")
    .replace(/\\includegraphics(\[[^\]]*\])?\{[^}]*\}/gi, " ")
    .replace(/\\cite(?:p|t)?\{[^}]*\}/gi, " ")
    .replace(/\\ref\{[^}]*\}/gi, " ")
    .replace(/\\label\{[^}]*\}/gi, " ");
}

function extractFirstExcerpt(body: string): string {
  const text = cleanLatexFragment(stripLatexBody(body));
  if (!text) return "";

  const sentence = text.match(/^[^.!?]{12,}[.!?]/)?.[0]?.trim();
  if (sentence && sentence.length >= 20) return sentence.slice(0, 180);

  const chunk = text.slice(0, 180).trim();
  const lastSpace = chunk.lastIndexOf(" ");
  if (lastSpace > 40) return chunk.slice(0, lastSpace);
  return chunk;
}

const SECTION_HEADING_RE =
  /\\(chapter|section|subsection|subsubsection)\*?\{([^}]+)\}/gi;

export function extractLatexPassages(latex: string): LatexPassage[] {
  if (!latex.trim()) return [];

  const headings: Array<{ level: number; title: string; bodyStart: number; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = SECTION_HEADING_RE.exec(latex)) !== null) {
    const kind = match[1].toLowerCase();
    const level =
      kind === "chapter" ? 0 : kind === "section" ? 1 : kind === "subsection" ? 2 : 3;
    headings.push({
      level,
      title: cleanLatexFragment(match[2]),
      bodyStart: match.index + match[0].length,
      index: match.index,
    });
  }

  return headings
    .map((heading, i) => {
      const bodyEnd = i + 1 < headings.length ? headings[i + 1]!.index : latex.length;
      const excerpt = extractFirstExcerpt(latex.slice(heading.bodyStart, bodyEnd));
      const title = heading.title;
      return {
        id: slugify(title),
        title,
        excerpt,
        level: heading.level,
      };
    })
    .filter((p) => p.title.length >= 2);
}

const TITLE_SYNONYM_GROUPS = [
  ["methods", "methodology", "approach", "phuong phap", "phương pháp"],
  ["experiments", "experimental", "results", "evaluation", "thi nghiem", "thí nghiệm"],
  ["introduction", "intro", "gioi thieu", "giới thiệu"],
  ["conclusion", "conclusions", "ket luan", "kết luận"],
  ["related work", "literature", "background"],
];

function normalizeTitleHint(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitleHint(a);
  const right = normalizeTitleHint(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  return TITLE_SYNONYM_GROUPS.some(
    (group) => group.includes(left) && group.includes(right),
  );
}

export function findPassageByTitleHint(
  passages: LatexPassage[],
  hint: string,
): LatexPassage | null {
  const needle = hint.trim();
  if (!needle) return null;

  const exact = passages.find((p) => titlesMatch(p.title, needle));
  if (exact) return exact;

  const slug = slugify(hint);
  return passages.find((p) => p.id === slug || p.id.includes(slug)) ?? null;
}

export function findPassageById(
  passages: LatexPassage[],
  passageId: string,
): LatexPassage | null {
  const id = passageId.trim().toLowerCase();
  return (
    passages.find((p) => p.id === id) ??
    passages.find((p) => p.id.includes(id) || id.includes(p.id)) ??
    null
  );
}
