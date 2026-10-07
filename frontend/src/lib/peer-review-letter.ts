import type { PeerReviewItem, ReviewCategory } from "@/lib/api/peer-review-api";

/** Headings/phrases used inside the exported letter (in the letter's language, not the UI's). */
export type ResponseLetterLabels = {
  title: string;
  intro: string;
  reviewer: (label: string) => string;
  general: string;
  comment: (index: number) => string;
  categories: Record<ReviewCategory, string>;
  response: string;
  changes: string;
  missingResponse: string;
};

export type ResponseLetterOptions = {
  labels: ResponseLetterLabels;
  includeChanges?: boolean;
};

export type ReviewerGroup = {
  /** Reviewer label ("R1", "Editor", …) or null for comments without a reviewer. */
  reviewer: string | null;
  items: PeerReviewItem[];
};

const PLACEHOLDER_RE = /\[AUTHOR:[^\]]*\]/gi;

function reviewerRank(label: string | null): [number, number] {
  if (label === null) return [3, 0];
  if (label.toLowerCase() === "editor") return [0, 0];
  const match = /^R(\d+)$/i.exec(label);
  if (match) return [1, Number(match[1])];
  return [2, 0];
}

/** Editor first, then R1…Rn numerically, other labels in order, unlabelled comments last. */
export function groupItemsByReviewer(items: PeerReviewItem[]): ReviewerGroup[] {
  const groups: ReviewerGroup[] = [];
  for (const item of items) {
    const reviewer = item.reviewer ?? null;
    let group = groups.find((g) => g.reviewer === reviewer);
    if (!group) {
      group = { reviewer, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups
    .map((group, order) => ({ group, order }))
    .sort((a, b) => {
      const [ra, na] = reviewerRank(a.group.reviewer);
      const [rb, nb] = reviewerRank(b.group.reviewer);
      return ra - rb || na - nb || a.order - b.order;
    })
    .map(({ group }) => group);
}

export type PeerReviewItemEdit = Partial<Pick<PeerReviewItem, "response" | "proposed_change">>;

/** Apply an author edit and refresh the flags derived from the text. */
export function applyItemEdit(item: PeerReviewItem, edit: PeerReviewItemEdit): PeerReviewItem {
  const next = { ...item, ...edit };
  const text = `${next.response}\n${next.proposed_change}`;
  return {
    ...next,
    needs_author_input: new RegExp(PLACEHOLDER_RE.source, "i").test(text),
    unverified_numbers: item.unverified_numbers.filter((num) => text.includes(num)),
    draft_failed: item.draft_failed && !next.response.trim(),
  };
}

export function countByCategory(items: PeerReviewItem[]): Record<ReviewCategory, number> {
  const counts: Record<ReviewCategory, number> = { major: 0, minor: 0, editorial: 0, question: 0 };
  for (const item of items) counts[item.category] += 1;
  return counts;
}

function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Escape pieces of text around `[AUTHOR: …]` placeholders and emphasise the placeholders. */
function renderWithPlaceholders(
  text: string,
  escape: (value: string) => string,
  emphasise: (escapedPlaceholder: string) => string,
): string {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const start = match.index ?? 0;
    out += escape(text.slice(last, start));
    out += emphasise(escape(match[0]));
    last = start + match[0].length;
  }
  return out + escape(text.slice(last));
}

// ─── Markdown ──────────────────────────────────────────────────────────────

const MD_INLINE_RE = /[\\`*_<>~]/g;

/** Escape text so reviewer/LLM prose cannot turn into Markdown structure. */
export function escapeMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(MD_INLINE_RE, (ch) => `\\${ch}`)
        .replace(/^(\s*)(#{1,6}|[+\-=])(?=\s|$)/, "$1\\$2")
        .replace(/^(\s*\d+)([.)])(?=\s|$)/, "$1\\$2"),
    )
    .join("\n");
}

function markdownText(text: string): string {
  return renderWithPlaceholders(normalizeNewlines(text), escapeMarkdown, (p) => `**${p}**`);
}

function markdownQuote(text: string): string {
  return escapeMarkdown(normalizeNewlines(text))
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

function reviewerTitle(reviewer: string | null, labels: ResponseLetterLabels): string {
  return reviewer === null ? labels.general : labels.reviewer(reviewer);
}

export function buildResponseLetterMarkdown(
  items: PeerReviewItem[],
  { labels, includeChanges = true }: ResponseLetterOptions,
): string {
  const parts: string[] = [`# ${escapeMarkdown(labels.title)}`, markdownText(labels.intro)];
  for (const group of groupItemsByReviewer(items)) {
    parts.push(`## ${escapeMarkdown(reviewerTitle(group.reviewer, labels))}`);
    group.items.forEach((item, index) => {
      parts.push(
        `### ${escapeMarkdown(`${labels.comment(index + 1)} (${labels.categories[item.category]})`)}`,
      );
      parts.push(markdownQuote(item.quote));
      const response = item.response.trim() || labels.missingResponse;
      parts.push(`**${escapeMarkdown(labels.response)}.** ${markdownText(response)}`);
      if (includeChanges && item.proposed_change.trim()) {
        parts.push(`**${escapeMarkdown(labels.changes)}.** ${markdownText(item.proposed_change)}`);
      }
    });
  }
  return `${parts.join("\n\n")}\n`;
}

// ─── LaTeX ─────────────────────────────────────────────────────────────────

const LATEX_SPECIALS: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  _: "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
  "<": "\\textless{}",
  ">": "\\textgreater{}",
};

const LATEX_SPECIAL_RE = /[\\{}$&#%_^~<>]/g;

/** Escape LaTeX special characters in a single pass (no double escaping). */
export function escapeLatex(text: string): string {
  return text.replace(LATEX_SPECIAL_RE, (ch) => LATEX_SPECIALS[ch] ?? ch);
}

function latexText(text: string): string {
  return renderWithPlaceholders(normalizeNewlines(text), escapeLatex, (p) => `\\textbf{${p}}`);
}

export function buildResponseLetterLatex(
  items: PeerReviewItem[],
  { labels, includeChanges = true }: ResponseLetterOptions,
): string {
  const lines: string[] = [
    "% Response to reviewers - draft generated with Proofline. Review every response before sending.",
    "% Placeholders marked [AUTHOR: ...] must be completed by the authors.",
    `\\section*{${escapeLatex(labels.title)}}`,
    "",
    latexText(labels.intro),
  ];
  for (const group of groupItemsByReviewer(items)) {
    lines.push("", `\\subsection*{${escapeLatex(reviewerTitle(group.reviewer, labels))}}`);
    group.items.forEach((item, index) => {
      const heading = `${labels.comment(index + 1)} (${labels.categories[item.category]})`;
      lines.push(
        "",
        `\\paragraph{${escapeLatex(heading)}.}`,
        "\\begin{quote}\\itshape",
        escapeLatex(normalizeNewlines(item.quote)),
        "\\end{quote}",
        `\\noindent\\textbf{${escapeLatex(labels.response)}.} ${latexText(item.response.trim() || labels.missingResponse)}`,
      );
      if (includeChanges && item.proposed_change.trim()) {
        lines.push(
          "",
          `\\noindent\\textbf{${escapeLatex(labels.changes)}.} ${latexText(item.proposed_change)}`,
        );
      }
    });
  }
  return `${lines.join("\n")}\n`;
}

// ─── Browser download ──────────────────────────────────────────────────────

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
