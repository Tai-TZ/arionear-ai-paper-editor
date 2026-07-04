import { contentFingerprint } from "@/lib/pending-edit-utils";
import { apiErrorsCopy } from "@/lib/api-errors-i18n";
import { parseCompileErrorLine } from "./editor-project-stats";

export const COMPILE_DEBOUNCE_MS = 1500;

export type CompilePayloadLike = {
  latex: string;
  mainFile: string;
  compiler: string;
  assets: Array<{ name: string; dataUrl: string }>;
};

/** Stable fingerprint of everything sent to the compile API. */
export function computeCompileFingerprint(payload: CompilePayloadLike): string {
  const parts = [payload.compiler, payload.mainFile, payload.latex];
  const sortedAssets = [...payload.assets].sort((a, b) => a.name.localeCompare(b.name));
  for (const asset of sortedAssets) {
    parts.push(asset.name);
    if (/\.(tex|bib)$/i.test(asset.name)) {
      parts.push(asset.dataUrl);
    } else {
      parts.push(String(asset.dataUrl.length));
      parts.push(asset.dataUrl.slice(-128));
    }
  }
  return contentFingerprint(parts.join("\0"));
}

const INFRA_COMPILE_MESSAGES = new Set([
  ...Object.values(apiErrorsCopy("en")),
  ...Object.values(apiErrorsCopy("vi")),
  "Compilation failed.",
]);

const LATEX_COMPILE_ERROR_PATTERNS = [
  /^!\s/m,
  /\bl\.\d+/,
  /LaTeX Error/i,
  /Undefined control sequence/i,
  /Emergency stop/i,
  /Fatal error/i,
  /pdfTeX error/i,
  /Package .* Error/i,
  /Runaway argument/i,
  /Missing \$ inserted/i,
  /File ended while scanning/i,
];

/** True when the compile error is a LaTeX source issue the editor agent can address. */
export function isAgentFixableCompileError(error: string): boolean {
  const trimmed = error.trim();
  if (!trimmed || INFRA_COMPILE_MESSAGES.has(trimmed)) return false;
  if (parseCompileErrorLine(trimmed)) return true;
  return LATEX_COMPILE_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
}
