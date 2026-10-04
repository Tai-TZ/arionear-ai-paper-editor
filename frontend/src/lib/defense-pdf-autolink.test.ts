import { describe, expect, it } from "vitest";

import { prepareDefenseCouncilMarkdown } from "./defense-pdf-autolink";

const LATEX = String.raw`\section{Introduction}
\section{Method}
We fine-tune \textbf{PubMedBERT} adapters.
\section{Results}`;

const LINK_RE = /\[[^\]]*\]\(#pdf\?[^)]*\)/g;

/** Every `[` must open a well-formed `[label](#pdf?…)` link — no nested or dangling brackets. */
function expectWellFormedLinks(markdown: string) {
  const withoutLinks = markdown.replace(LINK_RE, "");
  expect(withoutLinks).not.toMatch(/[[\]]/);
  for (const link of markdown.match(LINK_RE) ?? []) {
    expect(link.slice(1, link.indexOf("]"))).not.toContain("[");
  }
}

describe("prepareDefenseCouncilMarkdown", () => {
  it("keeps a model-written passage link intact when its label contains a Vietnamese phrase", () => {
    const reply =
      "Trong [phần phương pháp](#pdf?passage=method), điểm r(c) dùng trọng số λ. Kết quả ở Bảng I thì sao?";
    const out = prepareDefenseCouncilMarkdown(reply, LATEX);

    expectWellFormedLinks(out);
    expect(out).toContain("[phần phương pháp](#pdf?search=method)");
  });

  it("links a Vietnamese section phrase that is outside any link", () => {
    const out = prepareDefenseCouncilMarkdown("Hãy giải thích phương pháp của bạn.", LATEX);

    expectWellFormedLinks(out);
    expect(out).toMatch(/\[phương pháp\]\(#pdf\?search=[^)]+\)/);
  });

  it("does not link a LaTeX term that only appears inside an existing link label", () => {
    const reply = "Xem [PubMedBERT adapters](#pdf?search=PubMedBERT) trước.";
    const out = prepareDefenseCouncilMarkdown(reply, LATEX);

    expectWellFormedLinks(out);
    expect(out.match(LINK_RE)).toHaveLength(1);
  });

  it("links only the first plain occurrence of a LaTeX term", () => {
    const out = prepareDefenseCouncilMarkdown(
      "Why PubMedBERT? And why PubMedBERT over BioBERT?",
      LATEX,
    );

    expectWellFormedLinks(out);
    expect(out.match(/\(#pdf\?search=PubMedBERT\)/g)).toHaveLength(1);
  });

  it("never puts an auto-link inside $…$ or $$…$$ math", () => {
    const reply = String.raw`Với $\mathrm{PubMedBERT}(x)$ và $$\text{PubMedBERT}$$, vì sao PubMedBERT tốt hơn?`;
    const out = prepareDefenseCouncilMarkdown(reply, LATEX);

    expect(out).toContain(String.raw`$\mathrm{PubMedBERT}(x)$`);
    expect(out).toContain(String.raw`$$\text{PubMedBERT}$$`);
    expect(out).toContain("vì sao [PubMedBERT](#pdf?search=PubMedBERT) tốt hơn?");
  });

  it("still links a term between currency amounts, which are not math", () => {
    const out = prepareDefenseCouncilMarkdown(
      "It cost $5 to fine-tune PubMedBERT, not $10.",
      LATEX,
    );

    expect(out).toContain("[PubMedBERT](#pdf?search=PubMedBERT)");
  });

  it("drops links whose search term is a stopword but keeps the label text", () => {
    const out = prepareDefenseCouncilMarkdown("See [this part](#pdf?search=the).", LATEX);

    expect(out).toContain("See this part.");
  });
});
