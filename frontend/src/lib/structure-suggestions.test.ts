import { describe, expect, it } from "vitest";

import {
  buildEditRedoPrompt,
  buildStructureAskPrompt,
  buildStructureEditMessage,
  findSectionOutlineLine,
} from "@/lib/structure-suggestions";

describe("structure-suggestions", () => {
  it("finds section line in main tex", () => {
    const latex = String.raw`\begin{document}
\section{Introduction}
Hello
\section{Methods}
`;
    expect(findSectionOutlineLine(latex, "Introduction")).toBe(2);
  });

  it("builds template prompt for missing section", () => {
    const prompt = buildStructureAskPrompt({
      type: "missing",
      section: "Abstract",
      message: "Consider adding",
    });
    expect(prompt).toContain("/template");
    expect(prompt).toContain("Abstract");
  });

  it("builds direct edit message for structure fix", () => {
    const msg = buildStructureEditMessage({
      type: "length",
      section: "Methods",
      message: "too short",
    });
    expect(msg).toContain("Methods");
    expect(msg).not.toContain("/edit");
  });

  it("builds edit redo prompt", () => {
    const prompt = buildEditRedoPrompt({ section: "Abstract", description: "ngắn hơn" });
    expect(prompt).toContain("/edit");
    expect(prompt).toContain("Abstract");
  });
});
