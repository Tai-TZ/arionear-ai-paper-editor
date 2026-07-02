import { describe, expect, it } from "vitest";

import {
  canApplyPendingEdit,
  contentFingerprint,
  isPendingEditStale,
} from "@/lib/pending-edit-utils";

describe("pending-edit-utils", () => {
  it("detects stale selection when offsets no longer match", () => {
    const original = "Hello world";
    const edit = {
      file: "main.tex",
      applyMode: "selection" as const,
      originalText: "world",
      replacementText: "there",
      selectionStart: 6,
      selectionEnd: 11,
      sourceFingerprint: contentFingerprint(original),
    };
    expect(isPendingEditStale(edit, "Hello universe")).toBe(true);
    expect(canApplyPendingEdit(edit, "Hello universe")).toBe(false);
  });

  it("allows apply when only unrelated edits changed the file", () => {
    const original = "Alpha beta gamma";
    const edit = {
      file: "main.tex",
      applyMode: "selection" as const,
      originalText: "beta",
      replacementText: "BETA",
      selectionStart: 6,
      selectionEnd: 10,
      sourceFingerprint: contentFingerprint(original),
    };
    const touched = "Alpha BETA gamma";
    expect(isPendingEditStale(edit, touched)).toBe(false);
  });
});
