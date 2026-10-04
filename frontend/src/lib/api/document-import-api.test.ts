import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importDocumentFile } from "@/lib/api/document-import-api";
import { documentImportCopy } from "@/lib/document-import-i18n";

// Hoisted above the imports by vitest.
vi.mock("@/lib/auth-store", () => ({
  getAccessToken: () => "test-token",
  logoutUser: vi.fn(),
}));

const en = documentImportCopy("en");

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("importDocumentFile", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads multipart form data with the bearer token and parses the project", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        name: "From Word",
        mainFile: "main.tex",
        files: [{ path: "main.tex", content: "\\documentclass{article}" }],
        assets: [],
        compiler: "auto",
        warnings: [],
        sourceFormat: "docx",
      }),
    );
    const file = new File([new Uint8Array([80, 75, 3, 4])], "paper.docx");

    const result = await importDocumentFile(file, "en");

    expect(result.name).toBe("From Word");
    expect(result.files[0].path).toBe("main.tex");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/import\/document$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    expect(init.body).toBeInstanceOf(FormData);
    expect(((init.body as FormData).get("file") as File).name).toBe("paper.docx");
  });

  it("rejects unsupported files without calling the server", async () => {
    await expect(importDocumentFile(new File(["x"], "notes.txt"), "en")).rejects.toThrow(
      en.errors.unsupported,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces localized backend errors", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { detail: { code: "pdf_encrypted", message: "Password" } }),
    );
    await expect(importDocumentFile(new File(["%PDF-1.4"], "locked.pdf"), "en")).rejects.toThrow(
      en.errors.pdfEncrypted,
    );
  });
});
