import { createElement } from "react";
import { toast } from "sonner";
import { documentImportWarningLines, type DocumentImportWarning } from "@/lib/document-import";
import { documentImportCopy } from "@/lib/document-import-i18n";
import type { UiLanguage } from "@/lib/researcher-profile";

/** Show conversion warnings after a Word/PDF import (persists across the navigation to the editor). */
export function notifyDocumentImportWarnings(
  warnings: DocumentImportWarning[],
  locale: UiLanguage,
): void {
  const lines = documentImportWarningLines(warnings, locale);
  if (!lines.length) return;
  toast.warning(documentImportCopy(locale).warningsTitle, {
    description: createElement(
      "ul",
      { className: "mt-1 list-disc space-y-0.5 pl-4" },
      lines.map((line) => createElement("li", { key: line }, line)),
    ),
    duration: 15_000,
    closeButton: true,
  });
}
