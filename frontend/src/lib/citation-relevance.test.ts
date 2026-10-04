import { describe, expect, it } from "vitest";

import type { CitationRelevanceItem } from "@/lib/api/citation-relevance-api";
import {
  confidencePercent,
  countRelevanceVerdicts,
  relevanceBadgeClass,
  selectVerifiedCitationKeys,
} from "@/lib/citation-relevance";
import { citationRelevanceCopy } from "@/lib/citation-relevance-i18n";

function item(key: string, verdict: CitationRelevanceItem["verdict"]): CitationRelevanceItem {
  return {
    key,
    verdict,
    reason: verdict === "insufficient_info" ? "no_abstract" : "judged",
    rationale: "",
    confidence: 0.5,
    claim_snippets: [],
    source_title: "",
    source: "",
  };
}

describe("citation-relevance", () => {
  it("selects only verified keys, de-duplicated and capped", () => {
    const results = [
      { key: "a", status: "verified" },
      { key: "b", status: "not_found" },
      { key: "c", status: "verified" },
      { key: "a", status: "verified" },
      { key: "d", status: "possible_mismatch" },
      { key: " e ", status: "verified" },
      { status: "verified" },
    ];
    expect(selectVerifiedCitationKeys(results)).toEqual({ keys: ["a", "c", "e"], total: 3 });
    expect(selectVerifiedCitationKeys(results, 2)).toEqual({ keys: ["a", "c"], total: 3 });
  });

  it("caps at the server limit of 15 by default", () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, status: "verified" }));
    const { keys, total } = selectVerifiedCitationKeys(results);
    expect(keys).toHaveLength(15);
    expect(total).toBe(20);
  });

  it("counts verdicts", () => {
    const counts = countRelevanceVerdicts([
      item("a", "supports"),
      item("b", "supports"),
      item("c", "unrelated"),
      item("d", "insufficient_info"),
    ]);
    expect(counts).toEqual({ supports: 2, partial: 0, unrelated: 1, insufficient_info: 1 });
  });

  it("maps verdicts to distinct badge styles and clamps confidence", () => {
    const classes = new Set(
      (["supports", "partial", "unrelated", "insufficient_info"] as const).map(relevanceBadgeClass),
    );
    expect(classes.size).toBe(4);
    expect(confidencePercent(0.854)).toBe(85);
    expect(confidencePercent(3)).toBe(100);
    expect(confidencePercent(Number.NaN)).toBe(0);
  });

  it("has bilingual copy for every verdict", () => {
    for (const locale of ["en", "vi"] as const) {
      const t = citationRelevanceCopy(locale);
      expect(t.run).toContain("L4");
      expect(Object.values(t.verdict).every(Boolean)).toBe(true);
      expect(t.summary({ supports: 1, partial: 2, unrelated: 3, insufficient_info: 4 })).toMatch(
        /1.*2.*3.*4/,
      );
    }
    expect(citationRelevanceCopy("vi").verdict.supports).not.toBe(
      citationRelevanceCopy("en").verdict.supports,
    );
  });
});
