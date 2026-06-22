import { describe, expect, it } from "vitest";
import {
  detectCompilerFromSource,
  findMainTexFile,
  mergeProjectAssets,
  mergeProjectFiles,
} from "@/lib/latex-import";
import type { ProjectAsset, ProjectFile } from "@/lib/project-store";

describe("latex-import helpers", () => {
  it("finds main tex with documentclass", () => {
    const files: ProjectFile[] = [
      { path: "sections/intro.tex", content: "\\section{Intro}" },
      { path: "main.tex", content: "\\documentclass{article}\\begin{document}\\end{document}" },
    ];
    expect(findMainTexFile(files)).toBe("main.tex");
  });

  it("detects xelatex from fontspec", () => {
    expect(detectCompilerFromSource("\\usepackage{fontspec}")).toBe("xelatex");
  });

  it("merges project files by path", () => {
    const existing: ProjectFile[] = [{ path: "main.tex", content: "old" }];
    const incoming: ProjectFile[] = [
      { path: "main.tex", content: "new" },
      { path: "refs.bib", content: "@article{}" },
    ];
    const merged = mergeProjectFiles(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.find((f) => f.path === "main.tex")?.content).toBe("new");
  });

  it("merges assets case-insensitively", () => {
    const existing: ProjectAsset[] = [
      { name: "fig.png", mimeType: "image/png", dataUrl: "data:old" },
    ];
    const incoming: ProjectAsset[] = [
      { name: "FIG.PNG", mimeType: "image/png", dataUrl: "data:new" },
    ];
    const merged = mergeProjectAssets(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.dataUrl).toBe("data:new");
  });
});
