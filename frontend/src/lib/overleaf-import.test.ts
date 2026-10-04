import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { importOverleafZip } from "@/lib/overleaf-import";

function makeZip(entries: Record<string, string | Uint8Array>): File {
  const payload: Record<string, Uint8Array> = {};
  for (const [path, value] of Object.entries(entries)) {
    payload[path] = typeof value === "string" ? strToU8(value) : value;
  }
  const bytes = zipSync(payload);
  return new File([bytes], "overleaf-export.zip", { type: "application/zip" });
}

describe("importOverleafZip", () => {
  it("imports flat Overleaf zip with main tex and bib", async () => {
    const file = makeZip({
      "main.tex":
        "\\documentclass{article}\\title{EfficientNetV2}\\begin{document}Hi\\end{document}",
      "refs.bib": "@article{demo, title={Demo}}",
    });
    const result = await importOverleafZip(file);
    expect(result.mainFile).toBe("main.tex");
    expect(result.name).toBe("EfficientNetV2");
    expect(result.files).toHaveLength(2);
    expect(result.files.some((f) => f.path === "refs.bib")).toBe(true);
  });

  it("strips single root folder from Overleaf export", async () => {
    const file = makeZip({
      "my-paper/main.tex":
        "\\documentclass{article}\\title{Root Paper}\\begin{document}X\\end{document}",
      "my-paper/figures/plot.png": strToU8([137, 80, 78, 71]),
    });
    const result = await importOverleafZip(file);
    expect(result.mainFile).toBe("main.tex");
    expect(result.files[0]?.path).toBe("main.tex");
    expect(result.assets.some((a) => a.name === "figures/plot.png")).toBe(true);
  });

  it("detects latex source without .tex extension", async () => {
    const file = makeZip({
      "EfficientNetV2/manuscript":
        "\\documentclass{article}\\title{EfficientNetV2}\\begin{document}Hi\\end{document}",
    });
    const result = await importOverleafZip(file);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe("manuscript.tex");
  });

  it("imports all root-level images from flat Overleaf zip", async () => {
    const file = makeZip({
      "main.tex": "\\documentclass{article}\\begin{document}\\end{document}",
      "references.bib": "@article{a}",
      "Accuracy.png": strToU8([137, 80, 78, 71]),
      "Co thi.jpg": strToU8([255, 216, 255]),
      "Eff_met.png": strToU8([137, 80, 78, 71]),
      "Img3.png": strToU8([137, 80, 78, 71]),
      "Predict.png": strToU8([137, 80, 78, 71]),
    });
    const result = await importOverleafZip(file);
    expect(result.files).toHaveLength(2);
    expect(result.assets.filter((a) => /\.(png|jpg)$/i.test(a.name))).toHaveLength(5);
    expect(result.files.some((f) => f.path === "references.bib")).toBe(true);
  });
});
