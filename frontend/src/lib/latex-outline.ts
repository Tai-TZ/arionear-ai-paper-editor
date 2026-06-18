export type LatexOutlineItem = {
  id: string;
  label: string;
  kind: "abstract" | "chapter" | "section" | "subsection";
  line: number;
};

function lineAtOffset(text: string, offset: number): number {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

/** Extract navigable outline entries from LaTeX source. */
export function parseLatexOutline(latex: string): LatexOutlineItem[] {
  if (!latex.trim()) return [];

  const items: LatexOutlineItem[] = [];
  const abstractMatch = /\\begin\{abstract\}/i.exec(latex);
  if (abstractMatch) {
    items.push({
      id: "abstract",
      label: "Abstract",
      kind: "abstract",
      line: lineAtOffset(latex, abstractMatch.index),
    });
  }

  const headingRe = /\\(chapter|section|subsection)\*?\{([^}]*)\}/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = headingRe.exec(latex)) !== null) {
    const label = match[2].trim();
    if (!label) continue;
    const kind = match[1].toLowerCase() as LatexOutlineItem["kind"];
    items.push({
      id: `${kind}-${index}-${match.index}`,
      label,
      kind,
      line: lineAtOffset(latex, match.index),
    });
    index += 1;
  }

  return items;
}
