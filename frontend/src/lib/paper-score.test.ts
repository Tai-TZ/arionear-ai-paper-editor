import { describe, expect, it } from "vitest";

import { SAMPLE_LATEX_VI as IEEE_SAMPLE_LATEX } from "./project-store";
import { assessManuscriptMaturity, computePaperScore, extractPeerReviewItems } from "./paper-score";
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
  it("scores a complete IMRaD draft", () => {
    const result = computePaperScore({ latex: SAMPLE_LATEX });
    expect(result.overall).toBeGreaterThan(40);
    expect(result.dimensions.find((d) => d.id === "structure")?.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBeTruthy();
    expect(result.dimensions.some((d) => d.id === "logic")).toBe(true);
    expect(result.dimensions.some((d) => d.id === "readiness")).toBe(false);
    expect(result.dimensions).toHaveLength(4);
  });

  it("flags placeholder templates in the result", () => {
    const result = computePaperScore({ latex: IEEE_SAMPLE_LATEX });
    expect(result.isPlaceholderTemplate).toBe(true);
  });

  it("penalizes logic audit conflicts when peer review enabled", () => {
    const result = computePaperScore({
      latex: SAMPLE_LATEX,
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
      auditPending: true,
    });
    expect(result.overall).toBeGreaterThan(0);
    expect(result.grade).toBe("~");
    expect(result.gradeLabel).toBe("Đang đánh giá…");
    expect(result.agentScored).toBe(false);
    const logicDim = result.dimensions.find((d) => d.id === "logic");
    expect(logicDim).toBeDefined();
    expect(result.dimensions).toHaveLength(4);
  });

  it("uses audit summary in result", () => {
    const result = computePaperScore({
      latex: SAMPLE_LATEX,
      logicAuditReport: {
        summary: "Bản thảo ổn nhưng cần thêm citation ở Results.",
        sections: [{ section: "Abstract" }],
      },
    });
    expect(result.auditSummary).toContain("citation");
  });

  it("detects the built-in IEEE sample as a placeholder template", () => {
    const maturity = assessManuscriptMaturity(IEEE_SAMPLE_LATEX);
    expect(maturity.isPlaceholderTemplate).toBe(true);
    expect(maturity.bodyWordCount).toBeLessThan(220);
  });

  it("scores the built-in IEEE sample much lower than a real draft", () => {
    const templateResult = computePaperScore({
      latex: IEEE_SAMPLE_LATEX,
      logicAuditReport: {
        summary:
          "Manuscript hiện tại chỉ chứa các mô tả chung về cấu trúc và hướng dẫn thay thế nội dung, chưa chứa bất kỳ nội dung nghiên cứu khoa học cụ thể nào.",
        sections: [{ section: "Introduction", conflicts: [], weak_claims: [] }],
      },
    });
    const draftResult = computePaperScore({ latex: SAMPLE_LATEX });

    expect(templateResult.overall).toBeLessThan(55);
    expect(templateResult.dimensions.find((d) => d.id === "structure")?.score).toBeLessThanOrEqual(58);
    expect(templateResult.dimensions.find((d) => d.id === "completeness")?.score).toBeLessThanOrEqual(38);
    expect(templateResult.dimensions.find((d) => d.id === "logic")?.score).toBeLessThanOrEqual(38);
    expect(draftResult.overall).toBeGreaterThan(templateResult.overall);
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
    const vi = formatPaperScoreGateError("API key không hợp lệ", "vi");
    const en = formatPaperScoreGateError("invalid api key", "en");
    expect(vi).toContain("API key");
    expect(en).toContain("API key");
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

  it("needs re-audit when stored fingerprint is null despite gate report", () => {
    const gateReport = {
      sections: [{ section: "Abstract" }],
      meta: { audit_mode: "gate" },
    };
    expect(needsScoreGateAudit(SAMPLE_LATEX, gateReport, null)).toBe(true);
  });
});
