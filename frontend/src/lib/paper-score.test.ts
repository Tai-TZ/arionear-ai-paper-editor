import { describe, expect, it } from "vitest";

import { computePaperScore, extractPeerReviewItems } from "./paper-score";
import {
  formatPaperScoreGateError,
  hasUsableLogicAuditReport,
  logicAuditFingerprint,
  needsScoreGateAudit,
} from "./paper-score-audit";

const SAMPLE_LATEX = `\\documentclass{article}
\\begin{document}
\\begin{abstract}
Machine learning models achieve strong results but often lack interpretability.
\\end{abstract}
\\section{Introduction}
Prior work cites related methods and establishes the research gap for this study.
\\section{Methods}
We train a classifier on labeled data with standard preprocessing and cross-validation.
\\section{Results}
Our model reaches 92\\% accuracy on the test set with consistent performance across folds.
\\section{Discussion}
Results align with prior studies in the field and suggest directions for future work.
\\section{Conclusion}
We presented an interpretable pipeline for tabular data with practical implications.
\\end{document}`;

describe("computePaperScore", () => {
  it("scores a complete IMRaD draft with PDF", () => {
    const result = computePaperScore({
      latex: SAMPLE_LATEX,
      hasPdf: true,
    });
    expect(result.overall).toBeGreaterThan(40);
    expect(result.dimensions.find((d) => d.id === "structure")?.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBeTruthy();
    expect(result.dimensions.some((d) => d.id === "logic")).toBe(true);
    expect(result.dimensions.some((d) => d.id === "readiness")).toBe(false);
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
    expect(result.agentScored).toBe(true);
  });

  it("shows partial heuristic score while audit is pending", () => {
    const result = computePaperScore({
      latex: SAMPLE_LATEX,
      hasPdf: true,
      auditPending: true,
    });
    // Partial score from structure + completeness + citations only (no logic dim).
    expect(result.overall).toBeGreaterThan(0);
    expect(result.grade).toBe("~");
    expect(result.gradeLabel).toBe("Đang đánh giá…");
    expect(result.agentScored).toBe(false);
    // Logic dimension still shown in array (pending state) but not in weights.
    const logicDim = result.dimensions.find((d) => d.id === "logic");
    expect(logicDim).toBeDefined();
  });

  it("uses audit summary in result", () => {
    const result = computePaperScore({
      latex: SAMPLE_LATEX,
      hasPdf: true,
      logicAuditReport: {
        summary: "Bản thảo ổn nhưng cần thêm citation ở Results.",
        sections: [{ section: "Abstract" }],
      },
    });
    expect(result.auditSummary).toContain("citation");
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

describe("paper-score-audit helpers", () => {
  it("detects usable logic audit report", () => {
    expect(hasUsableLogicAuditReport(null)).toBe(false);
    expect(hasUsableLogicAuditReport({ sections: [{ section: "Intro" }] })).toBe(true);
    expect(hasUsableLogicAuditReport({ sections: [{ section: "Intro" }] }, true)).toBe(false);
    expect(
      hasUsableLogicAuditReport(
        { sections: [{ section: "Intro" }], meta: { audit_mode: "gate" } },
        true,
      ),
    ).toBe(true);
  });

  it("formats gate LLM errors with clearer guidance", () => {
    const msg = formatPaperScoreGateError("API key không hợp lệ");
    expect(msg).toContain("API key");
  });

  it("needs re-audit when latex fingerprint changes", () => {
    const fp = logicAuditFingerprint(SAMPLE_LATEX);
    const gateReport = {
      sections: [{ section: "Abstract" }],
      meta: { audit_mode: "gate" },
    };
    expect(needsScoreGateAudit(SAMPLE_LATEX, gateReport, fp)).toBe(false);
    expect(needsScoreGateAudit(SAMPLE_LATEX + " ", gateReport, fp)).toBe(true);
    expect(needsScoreGateAudit(SAMPLE_LATEX, null, null)).toBe(true);
    expect(
      needsScoreGateAudit(SAMPLE_LATEX, { sections: [{ section: "Abstract" }] }, fp),
    ).toBe(true);
  });
});
