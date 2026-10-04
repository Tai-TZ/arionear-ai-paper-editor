import { describe, expect, it } from "vitest";

import { nextLineKeys } from "./stable-line-keys";

describe("nextLineKeys", () => {
  it("starts with positional keys", () => {
    const state = nextLineKeys(null, ["a", "b", "c"]);
    expect(state.keys).toEqual([0, 1, 2]);
    expect(state.nextKey).toBe(3);
  });

  it("keeps every key when a line is edited in place", () => {
    const first = nextLineKeys(null, ["a", "b", "c"]);
    const next = nextLineKeys(first, ["a", "bx", "c"]);
    expect(next.keys).toEqual([0, 1, 2]);
  });

  it("keeps keys of the lines after an inserted line", () => {
    const first = nextLineKeys(null, ["a", "b", "c", "d"]);
    // Enter in the middle of "b" splits it into two lines.
    const next = nextLineKeys(first, ["a", "b1", "b2", "c", "d"]);
    expect(next.keys).toEqual([0, 1, 4, 2, 3]);
  });

  it("keeps keys of the lines after a deleted line", () => {
    const first = nextLineKeys(null, ["a", "b", "c", "d"]);
    const next = nextLineKeys(first, ["a", "c", "d"]);
    expect(next.keys).toEqual([0, 2, 3]);
  });

  it("never produces duplicate keys across many edits", () => {
    let state = nextLineKeys(null, ["", "", "x", ""]);
    const edits = [
      ["", "", "", "x", ""],
      ["", "x", ""],
      ["y", "", "x", "", "", ""],
      [""],
      [],
      ["a", "a", "a"],
      ["a", "b", "a", "a"],
    ];
    for (const lines of edits) {
      state = nextLineKeys(state, lines);
      expect(state.keys).toHaveLength(lines.length);
      expect(new Set(state.keys).size).toBe(lines.length);
    }
  });
});
