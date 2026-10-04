import { describe, expect, it } from "vitest";

import type { PeerReviewItem } from "@/lib/api/peer-review-api";
import { responseLetterLabels } from "@/lib/peer-review-i18n";
import {
  applyItemEdit,
  buildResponseLetterLatex,
  buildResponseLetterMarkdown,
  countByCategory,
  escapeLatex,
  escapeMarkdown,
  groupItemsByReviewer,
} from "@/lib/peer-review-letter";

function item(overrides: Partial<PeerReviewItem>): PeerReviewItem {
  return {
    id: "R1.1",
    reviewer: "R1",
    category: "minor",
    quote: "Please clarify the method.",
    quote_verified: true,
    summary: "",
    response: "We have clarified the Methods section.",
    proposed_change: "",
    section_refs: [],
    needs_author_input: false,
    unverified_numbers: [],
    draft_failed: false,
    ...overrides,
  };
}

const labels = responseLetterLabels("en");

describe("peer-review letter escaping", () => {
  it("escapes every LaTeX special character exactly once", () => {
    expect(escapeLatex("50% of $x_i$ & #3 {a} ~b^2 <c> \\cmd")).toBe(
      "50\\% of \\$x\\_i\\$ \\& \\#3 \\{a\\} \\textasciitilde{}b\\textasciicircum{}2 " +
        "\\textless{}c\\textgreater{} \\textbackslash{}cmd",
    );
  });

  it("does not double-escape backslash replacements", () => {
    expect(escapeLatex("\\{")).toBe("\\textbackslash{}\\{");
  });

  it("neutralises Markdown structure in reviewer text", () => {
    expect(escapeMarkdown("# Heading\n> quote\n- bullet\n1. item\nuse *bold* and _x_ `code`")).toBe(
      "\\# Heading\n\\> quote\n\\- bullet\n1\\. item\nuse \\*bold\\* and \\_x\\_ \\`code\\`",
    );
  });

  it("leaves ordinary prose and brackets untouched", () => {
    expect(escapeMarkdown("See Section 2 [AUTHOR: confirm] (p. 3).")).toBe(
      "See Section 2 [AUTHOR: confirm] (p. 3).",
    );
  });
});

describe("peer-review letter builders", () => {
  const items = [
    item({ id: "R2.1", reviewer: "R2", category: "question", quote: "Why 0.01?" }),
    item({
      id: "R1.1",
      category: "major",
      quote: "Sample size is small (n < 20).\nPlease justify.",
      response: "We added participants [AUTHOR: final n] to reach 95% power.",
      proposed_change: "Extend the study in Section_3.",
    }),
    item({ id: "C.1", reviewer: null, category: "editorial", quote: "Typos." }),
    item({ id: "Editor.1", reviewer: "Editor", quote: "Shorten the abstract." }),
  ];

  it("groups Editor first, reviewers numerically, unlabelled last", () => {
    expect(groupItemsByReviewer(items).map((g) => g.reviewer)).toEqual([
      "Editor",
      "R1",
      "R2",
      null,
    ]);
  });

  it("builds a Markdown letter with quotes, responses and highlighted placeholders", () => {
    const md = buildResponseLetterMarkdown(items, { labels });
    expect(md.startsWith("# Response to Reviewers\n")).toBe(true);
    expect(md).toContain("## Reviewer 1\n\n### Comment 1 (Major)");
    expect(md).toContain("> Sample size is small (n \\< 20).\n> Please justify.");
    expect(md).toContain(
      "**Response.** We added participants **[AUTHOR: final n]** to reach 95% power.",
    );
    expect(md).toContain("**Changes to the manuscript.** Extend the study in Section\\_3.");
    expect(md).toContain("## General comments");
    expect(md.indexOf("## Editor")).toBeLessThan(md.indexOf("## Reviewer 1"));
  });

  it("can omit proposed changes and fills missing responses with a placeholder", () => {
    const md = buildResponseLetterMarkdown([item({ response: "", proposed_change: "Do X." })], {
      labels,
      includeChanges: false,
    });
    expect(md).not.toContain("Changes to the manuscript");
    expect(md).toContain("**[AUTHOR: write the response to this comment]**");
  });

  it("builds an escaped LaTeX snippet", () => {
    const tex = buildResponseLetterLatex(items, { labels });
    expect(tex).not.toContain("\\documentclass");
    expect(tex).toContain("\\section*{Response to Reviewers}");
    expect(tex).toContain("\\subsection*{Reviewer 1}");
    expect(tex).toContain("\\paragraph{Comment 1 (Major).}");
    expect(tex).toContain("Sample size is small (n \\textless{} 20).");
    expect(tex).toContain(
      "\\noindent\\textbf{Response.} We added participants \\textbf{[AUTHOR: final n]} to reach 95\\% power.",
    );
    expect(tex).toContain("Extend the study in Section\\_3.");
  });

  it("uses Vietnamese letter labels when the reviewers wrote in Vietnamese", () => {
    const md = buildResponseLetterMarkdown([items[1]], { labels: responseLetterLabels("vi") });
    expect(md).toContain("# Phản hồi ý kiến phản biện");
    expect(md).toContain("## Phản biện 1");
    expect(md).toContain("**Trả lời.**");
  });

  it("counts categories", () => {
    expect(countByCategory(items)).toEqual({ major: 1, minor: 1, editorial: 1, question: 1 });
  });
});

describe("applyItemEdit", () => {
  it("refreshes placeholder and number flags from the edited text", () => {
    const original = item({
      response: "Accuracy is 93.4% [AUTHOR: confirm].",
      needs_author_input: true,
      unverified_numbers: ["93.4%"],
    });
    const edited = applyItemEdit(original, { response: "Accuracy is 91.0% as reported." });
    expect(edited.needs_author_input).toBe(false);
    expect(edited.unverified_numbers).toEqual([]);
    expect(original.needs_author_input).toBe(true);
  });

  it("clears the failed flag once the author writes a response", () => {
    const failed = item({ response: "", draft_failed: true });
    expect(applyItemEdit(failed, { response: "Our answer." }).draft_failed).toBe(false);
    expect(applyItemEdit(failed, { proposed_change: "x" }).draft_failed).toBe(true);
  });
});
