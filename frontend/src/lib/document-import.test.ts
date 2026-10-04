import { describe, expect, it } from "vitest";
import {
  DOCUMENT_IMPORT_ACCEPT,
  MAX_DOCUMENT_IMPORT_BYTES,
  documentImportErrorMessage,
  documentImportKind,
  documentImportWarningLines,
  documentImportWarningText,
  isDocumentImportFile,
  parseDocumentImportResponse,
  validateDocumentImportFile,
} from "@/lib/document-import";
import { documentImportCopy } from "@/lib/document-import-i18n";

const en = documentImportCopy("en");
const vi = documentImportCopy("vi");

describe("document import file checks", () => {
  it("recognises .docx and .pdf case-insensitively", () => {
    expect(documentImportKind("Paper.DOCX")).toBe("docx");
    expect(documentImportKind("folder/scan.pdf")).toBe("pdf");
    expect(documentImportKind("project.zip")).toBeNull();
    expect(isDocumentImportFile("notes.doc")).toBe(false);
    expect(DOCUMENT_IMPORT_ACCEPT).toContain(".docx");
    expect(DOCUMENT_IMPORT_ACCEPT).toContain(".pdf");
  });

  it("validates type, emptiness and size before uploading", () => {
    expect(validateDocumentImportFile({ name: "a.docx", size: 10 }, "en")).toBeNull();
    expect(validateDocumentImportFile({ name: "a.doc", size: 10 }, "en")).toBe(en.errors.legacyDoc);
    expect(validateDocumentImportFile({ name: "a.txt", size: 10 }, "vi")).toBe(
      vi.errors.unsupported,
    );
    expect(validateDocumentImportFile({ name: "a.pdf", size: 0 }, "en")).toBe(en.errors.empty);
    expect(
      validateDocumentImportFile({ name: "a.pdf", size: MAX_DOCUMENT_IMPORT_BYTES + 1 }, "en"),
    ).toBe(en.errors.tooLarge(15));
  });
});

describe("documentImportErrorMessage", () => {
  it("maps backend error codes to localized copy", () => {
    expect(documentImportErrorMessage(422, { code: "pdf_no_text", message: "No text" }, "vi")).toBe(
      vi.errors.pdfNoText,
    );
    expect(documentImportErrorMessage(400, { code: "content_mismatch", message: "x" }, "en")).toBe(
      en.errors.contentMismatch,
    );
    expect(documentImportErrorMessage(400, { code: "docx_protected", message: "x" }, "en")).toBe(
      en.errors.docxProtected,
    );
  });

  it("falls back on the HTTP status", () => {
    expect(documentImportErrorMessage(413, "Request Entity Too Large", "en")).toBe(
      en.errors.tooLarge(15),
    );
    expect(documentImportErrorMessage(415, null, "en")).toBe(en.errors.unsupported);
    expect(documentImportErrorMessage(500, null, "vi")).toBe(vi.errors.generic);
  });
});

describe("document import warnings", () => {
  it("localizes known codes and keeps the server message for unknown ones", () => {
    expect(documentImportWarningText({ code: "pdf_text_only", message: "x" }, "vi")).toBe(
      vi.warnings.pdfTextOnly,
    );
    expect(
      documentImportWarningText({ code: "docx_equations_skipped", message: "x", count: 3 }, "en"),
    ).toContain("3 equation(s)");
    expect(documentImportWarningText({ code: "something_new", message: "Server text" }, "en")).toBe(
      "Server text",
    );
  });

  it("deduplicates warning lines", () => {
    const lines = documentImportWarningLines(
      [
        { code: "pdf_text_only", message: "a" },
        { code: "pdf_text_only", message: "b" },
        { code: "pdf_no_headings", message: "c" },
      ],
      "en",
    );
    expect(lines).toEqual([en.warnings.pdfTextOnly, en.warnings.pdfNoHeadings]);
  });
});

describe("parseDocumentImportResponse", () => {
  const payload = {
    name: "Imported Paper",
    mainFile: "main.tex",
    files: [{ path: "main.tex", content: "\\documentclass{article}" }],
    assets: [
      { name: "figures/image1.png", mimeType: "image/png", dataUrl: "data:image/png;base64,AAAA" },
      { name: "bad.png", mimeType: "image/png", dataUrl: "https://evil.example/x.png" },
    ],
    compiler: "xelatex",
    warnings: [{ code: "pdf_text_only", message: "Text only", count: null }],
    sourceFormat: "pdf",
  };

  it("returns the Overleaf-import shape plus warnings", () => {
    const result = parseDocumentImportResponse(payload, "fallback");
    expect(result).toEqual({
      name: "Imported Paper",
      mainFile: "main.tex",
      files: [{ path: "main.tex", content: "\\documentclass{article}" }],
      assets: [
        {
          name: "figures/image1.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,AAAA",
        },
      ],
      compiler: "xelatex",
      warnings: [{ code: "pdf_text_only", message: "Text only", count: null }],
      sourceFormat: "pdf",
    });
  });

  it("repairs missing fields and rejects unusable payloads", () => {
    const repaired = parseDocumentImportResponse(
      { name: " ", mainFile: "missing.tex", files: payload.files, compiler: "weird" },
      "my-file",
    );
    expect(repaired?.name).toBe("my-file");
    expect(repaired?.mainFile).toBe("main.tex");
    expect(repaired?.compiler).toBe("auto");
    expect(repaired?.assets).toEqual([]);
    expect(repaired?.warnings).toEqual([]);
    expect(repaired?.sourceFormat).toBe("docx");

    expect(parseDocumentImportResponse({ files: [] }, "x")).toBeNull();
    expect(parseDocumentImportResponse(null, "x")).toBeNull();
  });
});
