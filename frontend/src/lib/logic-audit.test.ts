import { describe, expect, it } from "vitest";

import {
  buildLogicConflictAskPrompt,
  findExcerptLine,
  isGateAuditReport,
  listLogicAuditSectionOptions,
  logicAuditClientTimeoutMs,
  logicAuditIncludesCrossSection,
  logicAuditTargetSectionCount,
  resolveLogicIssueLine,
} from "@/lib/logic-audit";
import type { LatexOutlineItem } from "@/lib/latex-outline";

describe("findExcerptLine", () => {
  it("finds a line containing a long excerpt", () => {
    const latex = "\\section{Intro}\nWe claim state of the art accuracy on ImageNet.\n";
    expect(findExcerptLine(latex, "state of the art accuracy on ImageNet")).toBe(2);
  });

  it("returns null for very short excerpts", () => {
    expect(findExcerptLine("hello world", "short")).toBeNull();
  });
});

describe("resolveLogicIssueLine", () => {
  it("falls back to section heading when excerpt is missing", () => {
    const latex = "\\section{Introduction}\nBody text.\n";
    expect(resolveLogicIssueLine(latex, "Introduction")).toBe(1);
  });
});

describe("buildLogicConflictAskPrompt", () => {
  it("includes claim text when present", () => {
    const prompt = buildLogicConflictAskPrompt({
      section: "Introduction",
      comment: "No baseline comparison",
      claimText: "We achieve SOTA results",
    });
    expect(prompt).toContain("SOTA results");
    expect(prompt).toContain("/edit");
  });
});

describe("logicAuditClientTimeoutMs", () => {
  it("allows long full-manuscript audits", () => {
    expect(logicAuditClientTimeoutMs("quick", "full")).toBe(900_000);
  });
});

describe("listLogicAuditSectionOptions", () => {
  it("excludes subsections because backend audits section-level blocks only", () => {
    const options = listLogicAuditSectionOptions([
      { id: "s1", label: "Introduction", kind: "section", line: 1 },
      { id: "ss1", label: "Dataset", kind: "subsection", line: 5 },
    ]);
    expect(options).toEqual(["Introduction"]);
  });
});

describe("logicAuditTargetSectionCount", () => {
  it("caps full quick scans at 20 sections plus cross-section", () => {
    const names = ["Abstract", "Introduction", "Conclusion"];
    expect(logicAuditTargetSectionCount("quick", "full", 0, 25, names)).toBe(21);
  });

  it("uses selected count for scoped audits", () => {
    expect(logicAuditTargetSectionCount("quick", "selected", 2, 10, [])).toBe(2);
  });

  it("adds cross-section step for deep mode when abstract and conclusion exist", () => {
    expect(
      logicAuditTargetSectionCount("deep", "selected", 1, 5, [
        "Abstract",
        "Introduction",
        "Conclusion",
      ]),
    ).toBe(2);
  });

  it("skips cross-section step without abstract and conclusion", () => {
    expect(
      logicAuditTargetSectionCount("deep", "selected", 1, 5, ["Introduction"]),
    ).toBe(1);
  });
});

describe("logicAuditIncludesCrossSection", () => {
  it("requires abstract and conclusion headings", () => {
    expect(logicAuditIncludesCrossSection("deep", "selected", ["Introduction"])).toBe(
      false,
    );
    expect(
      logicAuditIncludesCrossSection("deep", "selected", ["Abstract", "Conclusion"]),
    ).toBe(true);
  });
});

describe("isGateAuditReport", () => {
  it("detects gate mode metadata", () => {
    expect(isGateAuditReport({ sections: [], meta: { audit_mode: "gate" } })).toBe(true);
    expect(isGateAuditReport({ sections: [], meta: { audit_mode: "quick" } })).toBe(false);
  });
});
