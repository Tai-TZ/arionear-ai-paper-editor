import { describe, expect, it } from "vitest";

import {
  applyEditToProjectFiles,
  applySingleEdit,
  suggestionToPendingEdit,
} from "@/features/editor/lib/editor-edit-apply";
import {
  buildChatLatexPayload,
  nextChatLatexSync,
  resetChatLatexSync,
} from "@/features/editor/lib/editor-chat-payload";
import { contentFingerprint } from "@/lib/pending-edit-utils";
import type { PendingEdit } from "@/features/editor/types";

describe("editor-edit-apply", () => {
  const baseEdit: PendingEdit = {
    id: "e1",
    file: "chapter.tex",
    applyMode: "selection",
    originalText: "old",
    replacementText: "new",
    flags: [],
    selectionStart: 0,
    selectionEnd: 3,
  };

  it("applies suggestion to a non-active project file", () => {
    const suggestion = suggestionToPendingEdit(
      {
        file: "chapter.tex",
        originalText: "old",
        suggestion: "new",
        diff: "",
        flags: [],
        applyMode: "selection",
        selectionStart: 0,
        selectionEnd: 3,
      },
      "main.tex",
    );
    const { nextActiveLatex, nextProjectFiles } = applyEditToProjectFiles({
      edit: suggestion,
      activeFile: "main.tex",
      mainFile: "main.tex",
      latex: "\\documentclass{article}",
      mainLatexSource: "\\documentclass{article}",
      projectFiles: [
        { path: "main.tex", content: "\\documentclass{article}" },
        { path: "chapter.tex", content: "old text" },
      ],
    });
    expect(nextActiveLatex).toBeNull();
    expect(nextProjectFiles?.find((f) => f.path === "chapter.tex")?.content).toBe("new text");
  });

  it("applies edit to active file buffer", () => {
    const { nextActiveLatex } = applyEditToProjectFiles({
      edit: { ...baseEdit, file: "main.tex" },
      activeFile: "main.tex",
      mainFile: "main.tex",
      latex: "old body",
      mainLatexSource: "old body",
      projectFiles: [{ path: "main.tex", content: "old body" }],
    });
    expect(nextActiveLatex).toBe("new body");
    expect(applySingleEdit("old body", { ...baseEdit, file: "main.tex" })).toBe("new body");
  });
});

describe("editor-chat-payload", () => {
  it("skips unchanged main latex body on follow-up requests", () => {
    const main = "\\documentclass{article}";
    const first = buildChatLatexPayload(main, main, "main.tex", "main.tex", resetChatLatexSync());
    expect(first.skipMainBody).toBe(false);
    const hash = contentFingerprint(main);
    const sync = nextChatLatexSync(resetChatLatexSync(), hash, hash, "main.tex", first);
    const second = buildChatLatexPayload(main, main, "main.tex", "main.tex", sync);
    expect(second.latexContent).toBe("");
    expect(second.skipMainBody).toBe(true);
  });

  it("sends auxiliary file content when active file differs from main", () => {
    const main = "main content";
    const chapter = "chapter content";
    const payload = buildChatLatexPayload(
      main,
      chapter,
      "chapter.tex",
      "main.tex",
      resetChatLatexSync(),
    );
    expect(payload.latexContent).toBe(main);
    expect(payload.activeFileContent).toBe(chapter);
  });

  it("resends auxiliary file when switching active files", () => {
    const main = "main";
    const chapterA = "chapter A";
    const chapterB = "chapter B";
    const first = buildChatLatexPayload(main, chapterA, "a.tex", "main.tex", resetChatLatexSync());
    const sync = nextChatLatexSync(
      resetChatLatexSync(),
      contentFingerprint(main),
      contentFingerprint(chapterA),
      "a.tex",
      first,
    );
    const switched = buildChatLatexPayload(main, chapterB, "b.tex", "main.tex", sync);
    expect(switched.activeFileContent).toBe(chapterB);
  });
});
