import { describe, expect, it } from "vitest";
import { buildProjectFileTree, collectFolderIds, countTreeFiles } from "@/lib/project-file-tree";

describe("buildProjectFileTree", () => {
  it("nests folders like Overleaf export", () => {
    const tree = buildProjectFileTree(
      [{ path: "main.tex" }, { path: "sections/intro.tex" }],
      [{ name: "figures/arch.png" }, { name: "references.bib" }, { name: "Accuracy.png" }],
    );

    expect(tree.map((n) => n.name)).toContain("main.tex");
    expect(tree.map((n) => n.name)).toContain("Accuracy.png");
    expect(tree.map((n) => n.name)).toContain("figures");
    expect(tree.map((n) => n.name)).toContain("sections");
    expect(tree.map((n) => n.name)).toContain("references.bib");

    const figures = tree.find((n) => n.name === "figures");
    expect(figures?.children?.[0]?.name).toBe("arch.png");
  });

  it("expands all folder ids", () => {
    const tree = buildProjectFileTree([{ path: "a/b/main.tex" }], []);
    const ids = collectFolderIds(tree);
    expect(ids).toContain("folder:a");
    expect(ids).toContain("folder:a/b");
    expect(countTreeFiles(tree)).toBe(1);
  });
});
