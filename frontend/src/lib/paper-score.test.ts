import { describe, expect, it } from "vitest";

import { computePaperScore, extractPeerReviewItems } from "./paper-score";

const SAMPLE_LATEX = `\\documentclass{article}
\\begin{document}
\\begin{abstract}
Machine learning models achieve strong results but often lack interpretability.
\\end{abstract}
\\section{Introduction}
Prior work cites related methods.
\\section{Methods}
We train a classifier on labeled data with standard preprocessing.
\\section{Results}
Our model reaches 92\\% accuracy on the test set.
\\section{Discussion}
Results align with prior studies in the field.
\\section{Conclusion}
We presented an interpretable pipeline for tabular data.
\\end{document}`;

describe("computePaperScore", () => {
  it("scores a complete IMRaD draft with PDF", () => {
    const result = computePaperScore({
      latex: SAMPLE_LATEX,
      hasPdf: true,
    });
    expect(result.overall).toBeGreaterThan(40);
    expect(result.dimensions.find((d) => d.id === "structure")?.score).toBe(100);
    expect(result.grade).toBeTruthy();
  });

  it("penalizes logic audit conflicts when peer review enabled", () => {
    const result = computePaperScore({
      latex: SAMPLE_LATEX,
      hasPdf: true,
      includeLogicReview: true,
      logicAuditReport: {
        sections: [
          {
            section: "Results",
            conflicts: [
              {
                id: "c1",
                type: "unsupported_claim",
                severity: "critical",
                comment: "Accuracy claim lacks citation.",
              },
            ],
          },
        ],
      },
    });
    const logic = result.dimensions.find((d) => d.id === "logic");
    expect(logic?.score).toBeLessThan(100);
  });
});

describe("extractPeerReviewItems", () => {
  it("flattens logic audit into peer review cards", () => {
    const items = extractPeerReviewItems({
      sections: [
        {
          section: "Abstract",
          conflicts: [
            {
              id: "x1",
              type: "unclear_reasoning",
              severity: "warning",
              comment: "Scope is vague.",
              persona_sources: ["novice_reader"],
            },
          ],
        },
      ],
      cross_section_conflicts: [{ type: "mismatch", description: "Abstract vs Conclusion differ." }],
    });
    expect(items).toHaveLength(2);
    expect(items[0].persona).toContain("novice_reader");
  });
});
