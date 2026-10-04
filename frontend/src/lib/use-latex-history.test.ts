import { describe, expect, it } from "vitest";
import { appendHistorySnapshot, HISTORY_LIMITS } from "@/lib/use-latex-history";

describe("appendHistorySnapshot", () => {
  it("appends after the current index and drops the redo branch", () => {
    expect(appendHistorySnapshot(["a", "b", "c"], 1, "d")).toEqual({
      history: ["a", "b", "d"],
      index: 2,
    });
  });

  it("ignores a snapshot equal to the current one", () => {
    expect(appendHistorySnapshot(["a", "b"], 1, "b")).toBeNull();
  });

  it("drops the oldest snapshots past the entry limit", () => {
    const limits = { maxEntries: 3, maxChars: Number.POSITIVE_INFINITY };
    expect(appendHistorySnapshot(["a", "b", "c"], 2, "d", limits)).toEqual({
      history: ["b", "c", "d"],
      index: 2,
    });
  });

  it("drops the oldest snapshots past the character budget", () => {
    const limits = { maxEntries: 100, maxChars: 10 };
    expect(appendHistorySnapshot(["aaaa", "bbbb", "cccc"], 2, "dddd", limits)).toEqual({
      history: ["cccc", "dddd"],
      index: 1,
    });
  });

  it("always keeps the newest snapshot, even when it alone exceeds the budget", () => {
    const limits = { maxEntries: 100, maxChars: 3 };
    expect(appendHistorySnapshot(["a"], 0, "too long", limits)).toEqual({
      history: ["too long"],
      index: 0,
    });
  });

  it("stays bounded by the default limits over many edits", () => {
    let history = [""];
    let index = 0;
    for (let i = 1; i <= HISTORY_LIMITS.maxEntries + 50; i += 1) {
      const next = appendHistorySnapshot(history, index, `v${i}`);
      if (!next) throw new Error("unexpected duplicate snapshot");
      ({ history, index } = next);
    }
    expect(history).toHaveLength(HISTORY_LIMITS.maxEntries);
    expect(history.at(-1)).toBe(`v${HISTORY_LIMITS.maxEntries + 50}`);
    expect(index).toBe(HISTORY_LIMITS.maxEntries - 1);
  });
});
