/**
 * Word (.docx) / PDF → LaTeX import helpers (pure — no network, no DOM).
 * Conversion runs on the backend (`POST /import/document`); the result has the same shape as the
 * Overleaf ZIP importer so it goes through `createPaperFromImport` unchanged.
 */

import { documentImportCopy } from "@/lib/document-import-i18n";
import type { LatexImportResult } from "@/lib/latex-import";
import type { LatexCompiler, ProjectAsset, ProjectFile } from "@/lib/project-store";
import type { UiLanguage } from "@/lib/researcher-profile";

export type DocumentSourceFormat = "docx" | "pdf";

export type DocumentImportWarning = {
  code: string;
  message: string;
  count?: number | null;
};

export type DocumentImportResult = LatexImportResult & {
  warnings: DocumentImportWarning[];
  sourceFormat: DocumentSourceFormat;
};

/** Mirrors `MAX_IMPORT_BYTES` in `src/services/document_import/validation.py`. */
export const MAX_DOCUMENT_IMPORT_BYTES = 15 * 1024 * 1024;

export const DOCUMENT_IMPORT_ACCEPT = [
  ".docx",
  ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/pdf",
].join(",");

const COMPILERS: readonly LatexCompiler[] = ["auto", "pdflatex", "xelatex", "lualatex", "latex"];

function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

export function documentImportKind(name: string): DocumentSourceFormat | null {
  const ext = extensionOf(name);
  if (ext === ".docx") return "docx";
  if (ext === ".pdf") return "pdf";
  return null;
}

export function isDocumentImportFile(name: string): boolean {
  return documentImportKind(name) !== null;
}

/** Client-side pre-check (the server validates again). Returns a localized error or `null`. */
export function validateDocumentImportFile(
  file: { name: string; size: number },
  locale: UiLanguage,
): string | null {
  const copy = documentImportCopy(locale).errors;
  if (!isDocumentImportFile(file.name)) {
    return extensionOf(file.name) === ".doc" ? copy.legacyDoc : copy.unsupported;
  }
  if (file.size <= 0) return copy.empty;
  if (file.size > MAX_DOCUMENT_IMPORT_BYTES) {
    return copy.tooLarge(Math.round(MAX_DOCUMENT_IMPORT_BYTES / (1024 * 1024)));
  }
  return null;
}

function detailField(detail: unknown, key: "code" | "message"): string | null {
  if (!detail || typeof detail !== "object") return null;
  const value = (detail as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Map an error response from `POST /import/document` (`detail: {code, message}`) to UI copy. */
export function documentImportErrorMessage(
  status: number,
  detail: unknown,
  locale: UiLanguage,
): string {
  const copy = documentImportCopy(locale).errors;
  const maxMb = Math.round(MAX_DOCUMENT_IMPORT_BYTES / (1024 * 1024));
  switch (detailField(detail, "code")) {
    case "unsupported_type":
      return copy.unsupported;
    case "legacy_doc":
      return copy.legacyDoc;
    case "file_too_large":
      return copy.tooLarge(maxMb);
    case "empty_file":
      return copy.empty;
    case "content_mismatch":
      return copy.contentMismatch;
    case "docx_protected":
      return copy.docxProtected;
    case "docx_invalid":
      return copy.docxInvalid;
    case "pdf_encrypted":
      return copy.pdfEncrypted;
    case "pdf_invalid":
      return copy.pdfInvalid;
    case "pdf_no_text":
      return copy.pdfNoText;
    case "conversion_failed":
      return copy.conversionFailed;
    default:
      break;
  }
  if (status === 413) return copy.tooLarge(maxMb);
  if (status === 415) return copy.unsupported;
  if (status === 422) return copy.conversionFailed;
  return copy.generic;
}

/** Localized text for one backend warning (falls back to the server's English message). */
export function documentImportWarningText(
  warning: DocumentImportWarning,
  locale: UiLanguage,
): string {
  const copy = documentImportCopy(locale).warnings;
  const count = typeof warning.count === "number" ? warning.count : 0;
  switch (warning.code) {
    case "pdf_text_only":
      return copy.pdfTextOnly;
    case "pdf_pages_truncated":
      return copy.pdfPagesTruncated(count);
    case "pdf_no_headings":
      return copy.pdfNoHeadings;
    case "pdf_unmapped_glyphs":
      return copy.pdfUnmappedGlyphs(count);
    case "docx_equations_skipped":
      return copy.docxEquationsSkipped(count);
    case "docx_footnotes_skipped":
      return copy.docxFootnotesSkipped(count);
    case "docx_images_unsupported":
      return copy.docxImagesUnsupported(count);
    case "docx_graphics_skipped":
      return copy.docxGraphicsSkipped(count);
    case "docx_table_images_skipped":
      return copy.docxTableImagesSkipped(count);
    case "empty_document":
      return copy.emptyDocument;
    default:
      return warning.message;
  }
}

export function documentImportWarningLines(
  warnings: DocumentImportWarning[],
  locale: UiLanguage,
): string[] {
  const lines = warnings.map((w) => documentImportWarningText(w, locale)).filter(Boolean);
  return [...new Set(lines)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFiles(value: unknown): ProjectFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((f) => typeof f.path === "string" && f.path && typeof f.content === "string")
    .map((f) => ({ path: f.path as string, content: f.content as string }));
}

function parseAssets(value: unknown): ProjectAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter(
      (a) =>
        typeof a.name === "string" &&
        a.name &&
        typeof a.mimeType === "string" &&
        typeof a.dataUrl === "string" &&
        a.dataUrl.startsWith("data:"),
    )
    .map((a) => ({
      name: a.name as string,
      mimeType: a.mimeType as string,
      dataUrl: a.dataUrl as string,
    }));
}

function parseWarnings(value: unknown): DocumentImportWarning[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .filter((w) => typeof w.code === "string" && typeof w.message === "string")
    .map((w) => ({
      code: w.code as string,
      message: w.message as string,
      count: typeof w.count === "number" ? w.count : null,
    }));
}

/** Validate the JSON returned by `POST /import/document`. Returns `null` when it is unusable. */
export function parseDocumentImportResponse(
  data: unknown,
  fallbackName: string,
): DocumentImportResult | null {
  if (!isRecord(data)) return null;
  const files = parseFiles(data.files);
  if (!files.length) return null;

  const mainFile =
    typeof data.mainFile === "string" && files.some((f) => f.path === data.mainFile)
      ? data.mainFile
      : files[0].path;
  const compiler = COMPILERS.find((c) => c === data.compiler) ?? "auto";
  const name =
    typeof data.name === "string" && data.name.trim() ? data.name.trim() : fallbackName.trim();
  const sourceFormat: DocumentSourceFormat = data.sourceFormat === "pdf" ? "pdf" : "docx";

  return {
    name: name || "Imported document",
    files,
    mainFile,
    assets: parseAssets(data.assets),
    compiler,
    warnings: parseWarnings(data.warnings),
    sourceFormat,
  };
}
