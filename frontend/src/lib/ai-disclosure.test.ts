import { describe, expect, it } from "vitest";

import type { AiDisclosureReport } from "./api/ai-disclosure-api";
import {
  acceptedTotal,
  aiDisclosureFilename,
  disclosureText,
  formatDisclosurePeriod,
  serializeAiDisclosureReport,
} from "./ai-disclosure";

const EMPTY_COUNTS = { proposed: 0, accepted: 0, modified: 0, rejected: 0, pending: 0 };

function makeReport(overrides: Partial<AiDisclosureReport> = {}): AiDisclosureReport {
  return {
    paper_id: "p1",
    paper_title: "Paper",
    generated_at: "2026-10-04T12:00:00Z",
    has_ai_usage: true,
    period: { first_interaction_at: null, last_interaction_at: null },
    totals: { ...EMPTY_COUNTS, interactions: 0 },
    by_task: [],
    unattributed: EMPTY_COUNTS,
    models: [],
    attribution: { linked: 0, inferred: 0, unattributed: 0 },
    statement: { en: "EN statement", vi: "VI statement" },
    latex: { en: "EN latex", vi: "VI latex" },
    data_sources: ["ai_sessions", "suggestions"],
    ...overrides,
  };
}

describe("aiDisclosureFilename", () => {
  it("slugifies Vietnamese titles and appends the UTC report date", () => {
    expect(aiDisclosureFilename("Đánh giá mô hình: AI & Học sâu!", "2026-10-04T23:30:00Z")).toBe(
      "ai-disclosure-danh-gia-mo-hinh-ai-hoc-sau-2026-10-04.json",
    );
  });

  it("treats timezone-less backend timestamps as UTC", () => {
    expect(aiDisclosureFilename("My Paper", "2026-03-01T00:15:00")).toBe(
      "ai-disclosure-my-paper-2026-03-01.json",
    );
  });

  it("falls back to a generic slug and omits an unparseable date", () => {
    expect(aiDisclosureFilename("!!!", "not-a-date")).toBe("ai-disclosure-paper.json");
  });

  it("caps very long titles without a trailing dash", () => {
    const name = aiDisclosureFilename(`${"word ".repeat(30)}end`, "2026-10-04T00:00:00Z");
    const slug = name.replace(/^ai-disclosure-/, "").replace(/-2026-10-04\.json$/, "");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("formatDisclosurePeriod", () => {
  it("returns null when no interaction was recorded", () => {
    expect(formatDisclosurePeriod(makeReport().period, "en")).toBeNull();
  });

  it("collapses a single-day period to one date", () => {
    const period = {
      first_interaction_at: "2026-03-01T09:00:00Z",
      last_interaction_at: "2026-03-01T17:30:00Z",
    };
    expect(formatDisclosurePeriod(period, "en", "UTC")).toBe("Mar 1, 2026");
  });

  it("formats a range in the UI locale", () => {
    const period = {
      first_interaction_at: "2026-03-01T09:00:00Z",
      last_interaction_at: "2026-05-20T09:00:00Z",
    };
    expect(formatDisclosurePeriod(period, "en", "UTC")).toBe("Mar 1, 2026 – May 20, 2026");
    const vi = formatDisclosurePeriod(period, "vi", "UTC");
    expect(vi).toContain("2026");
    expect(vi).toContain(" – ");
  });
});

describe("disclosure text helpers", () => {
  it("picks the requested language", () => {
    const report = makeReport();
    expect(disclosureText(report, "vi")).toEqual({ statement: "VI statement", latex: "VI latex" });
    expect(disclosureText(report, "en")).toEqual({ statement: "EN statement", latex: "EN latex" });
  });

  it("falls back to English when a translation is empty", () => {
    const report = makeReport({ statement: { en: "EN only", vi: "" } });
    expect(disclosureText(report, "vi").statement).toBe("EN only");
  });

  it("counts modified suggestions as accepted", () => {
    expect(acceptedTotal({ ...EMPTY_COUNTS, accepted: 2, modified: 1 })).toBe(3);
  });

  it("serializes the report as pretty JSON with a trailing newline", () => {
    const json = serializeAiDisclosureReport(makeReport());
    expect(json.endsWith("}\n")).toBe(true);
    expect(JSON.parse(json).paper_id).toBe("p1");
  });
});
