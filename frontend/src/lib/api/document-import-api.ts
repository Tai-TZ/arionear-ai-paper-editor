import { getAccessToken, logoutUser } from "@/lib/auth-store";
import { resolveApiBase } from "@/lib/api/base-url";
import { networkErrorMsg } from "@/lib/api/api-errors";
import {
  documentImportErrorMessage,
  parseDocumentImportResponse,
  validateDocumentImportFile,
  type DocumentImportResult,
} from "@/lib/document-import";
import { documentImportCopy } from "@/lib/document-import-i18n";
import type { UiLanguage } from "@/lib/researcher-profile";

const API_BASE = resolveApiBase();

/**
 * Upload a Word (.docx) or PDF file and get back a LaTeX project
 * (`{ name, mainFile, files, assets, compiler, warnings }`) ready for `createPaperFromImport`.
 */
export async function importDocumentFile(
  file: File,
  locale: UiLanguage,
): Promise<DocumentImportResult> {
  const invalid = validateDocumentImportFile(file, locale);
  if (invalid) throw new Error(invalid);

  const token = getAccessToken();
  if (!token) throw new Error("Not authenticated.");

  const form = new FormData();
  form.append("file", file, file.name);

  let res: Response;
  try {
    // No Content-Type header: the browser sets the multipart boundary.
    res = await fetch(`${API_BASE}/import/document`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new Error(networkErrorMsg(locale));
  }

  if (res.status === 401 || res.status === 403) {
    logoutUser();
    if (typeof window !== "undefined") {
      window.location.assign("/signin");
    }
    throw new Error("Not authenticated.");
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const detail = body && typeof body === "object" ? (body as { detail?: unknown }).detail : null;
    throw new Error(documentImportErrorMessage(res.status, detail, locale));
  }

  const parsed = parseDocumentImportResponse(body, file.name.replace(/\.(docx|pdf)$/i, ""));
  if (!parsed) throw new Error(documentImportCopy(locale).errors.invalidResponse);
  return parsed;
}
