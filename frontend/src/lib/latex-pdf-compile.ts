import type { ProjectAsset } from "@/lib/project-store";
import { normalizeAssetName } from "@/lib/project-store";

export type LatexCompileResult = {
  success: boolean;
  pdfUrl: string | null;
  log: string;
  error?: string;
};

type AdditionalFile = {
  path: string;
  content: string | Uint8Array;
};

let runnerPromise: Promise<import("texlyre-busytex").BusyTexRunner> | null = null;
let initError: string | null = null;

const BUSYTEX_BASE = "/core/busytex";

const TEXLIVE_PACKAGES = {
  basic: `${BUSYTEX_BASE}/texlive-basic.js`,
  recommended: `${BUSYTEX_BASE}/texlive-recommended.js`,
  extra: `${BUSYTEX_BASE}/texlive-extra.js`,
} as const;

function dataPackagesForLatex(latex: string): string[] {
  const packages: string[] = [TEXLIVE_PACKAGES.basic, TEXLIVE_PACKAGES.recommended];
  if (
    /\\documentclass(?:\[[^\]]*\])?\{IEEEtran\}/i.test(latex) ||
    /\\usepackage(?:\[[^\]]*\])?\{[^}]*(?:graphicx|subfig|algorithm|listings|hyperref)/i.test(latex)
  ) {
    packages.push(TEXLIVE_PACKAGES.extra);
  }
  return packages;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid data URL");
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function assetToAdditionalFile(asset: ProjectAsset): AdditionalFile {
  const path = normalizeAssetName(asset.name);
  return {
    path,
    content: dataUrlToBytes(asset.dataUrl),
  };
}

function needsBibtex(latex: string): boolean {
  return /\\bibliography\{/.test(latex) || /\\bibliographystyle\{/.test(latex);
}

function needsRerun(latex: string): boolean {
  return (
    needsBibtex(latex) ||
    /\\tableofcontents/.test(latex) ||
    /\\ref\{/.test(latex) ||
    /\\cite[p]?\{/.test(latex)
  );
}

async function getRunner(): Promise<import("texlyre-busytex").BusyTexRunner> {
  if (initError) throw new Error(initError);
  if (!runnerPromise) {
    runnerPromise = (async () => {
      const { BusyTexRunner } = await import("texlyre-busytex");
      const runner = new BusyTexRunner({
        busytexBasePath: BUSYTEX_BASE,
        verbose: false,
        preloadDataPackages: [TEXLIVE_PACKAGES.basic],
        catalogDataPackages: Object.values(TEXLIVE_PACKAGES),
      });
      await runner.initialize(true);
      return runner;
    })().catch((err: unknown) => {
      initError =
        err instanceof Error
          ? err.message
          : "Failed to initialize LaTeX engine. Run: npm run download:tex-assets";
      runnerPromise = null;
      throw new Error(initError);
    });
  }
  return runnerPromise;
}

export async function compileLatexToPdf(
  latex: string,
  assets: ProjectAsset[] = [],
): Promise<LatexCompileResult> {
  try {
    const runner = await getRunner();
    const { PdfLatex } = await import("texlyre-busytex");
    const pdflatex = new PdfLatex(runner);

    const additionalFiles: AdditionalFile[] = assets.map(assetToAdditionalFile);

    const bibAssets = assets.filter((a) => /\.bib$/i.test(a.name));
    const hasBibInLatex = /\\begin\{filecontents\*\}\{[^}]+\.bib\}/i.test(latex);

    const result = await pdflatex.compile({
      input: latex,
      mainTexPath: "main.tex",
      bibtex: needsBibtex(latex) || bibAssets.length > 0,
      rerun: needsRerun(latex),
      additionalFiles,
      dataPackagesJs: dataPackagesForLatex(latex),
      verbose: hasBibInLatex || bibAssets.length > 0 ? "info" : "silent",
    });

    if (result.success && result.pdf) {
      const pdfBytes = new Uint8Array(result.pdf);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      return {
        success: true,
        pdfUrl: URL.createObjectURL(blob),
        log: result.log ?? "",
      };
    }

    const tail = (result.log ?? "").split("\n").slice(-20).join("\n");
    return {
      success: false,
      pdfUrl: null,
      log: result.log ?? "",
      error: tail || "Compilation failed",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Compilation error";
    return {
      success: false,
      pdfUrl: null,
      log: "",
      error: message,
    };
  }
}

export function revokePdfUrl(url: string | null) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

export async function checkBusyTexAssets(): Promise<boolean> {
  try {
    const res = await fetch(`${BUSYTEX_BASE}/busytex_worker.js`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
