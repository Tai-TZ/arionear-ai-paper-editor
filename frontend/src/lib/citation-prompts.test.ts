import { describe, expect, it } from "vitest";
import { buildCitationFixPrompt, findCiteKeyLine } from "@/lib/citation-prompts";

describe("findCiteKeyLine", () => {
  it("finds cite command line", () => {
    const latex = [
      "\\section{Intro}",
      "Prior work \\cite{smith2020,jones2021} shows results.",
      "@article{smith2020, title={Foo}}",
    ].join("\n");
    expect(findCiteKeyLine(latex, "smith2020")).toBe(2);
  });

  it("finds bibliography entry when cite is absent", () => {
    const latex = "@article{smith2020,\n  title={Foo},\n}";
    expect(findCiteKeyLine(latex, "smith2020")).toBe(1);
  });

  it("returns null for unknown key", () => {
    expect(findCiteKeyLine("\\cite{known}", "missing")).toBeNull();
  });
});

describe("buildCitationFixPrompt", () => {
  it("includes cite key in edit prompt", () => {
    expect(buildCitationFixPrompt("smith2020")).toContain("smith2020");
  });
});
