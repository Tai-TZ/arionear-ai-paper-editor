import type { AiDisclosureCounts, AiDisclosureReport } from "@/lib/api/ai-disclosure-api";
import { localeBcp47, parseApiTimestamp } from "@/lib/date-i18n";
import type { UiLanguage } from "@/lib/researcher-profile";

/** Accepted as proposed plus accepted after the author modified the diff. */
export function acceptedTotal(counts: AiDisclosureCounts): number {
  return counts.accepted + counts.modified;
}

/** Statement + LaTeX snippet in one language (falls back to EN if the other is missing). */
export function disclosureText(
  report: AiDisclosureReport,
  lang: UiLanguage,
): { statement: string; latex: string } {
  return {
    statement: report.statement[lang] || report.statement.en,
    latex: report.latex[lang] || report.latex.en,
  };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** `ai-disclosure-<paper-slug>-<YYYY-MM-DD>.json` (UTC date of report generation). */
export function aiDisclosureFilename(paperTitle: string, generatedAt: string): string {
  const slug = slugify(paperTitle) || "paper";
  const ms = parseApiTimestamp(generatedAt);
  const date = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "";
  return date ? `ai-disclosure-${slug}-${date}.json` : `ai-disclosure-${slug}.json`;
}

export function serializeAiDisclosureReport(report: AiDisclosureReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * Human-readable period of AI use: one date when first/last fall on the same day,
 * otherwise `start – end`; `null` when nothing was recorded.
 */
export function formatDisclosurePeriod(
  period: AiDisclosureReport["period"],
  locale: UiLanguage,
  timeZone?: string,
): string | null {
  const first = period.first_interaction_at ? parseApiTimestamp(period.first_interaction_at) : NaN;
  const last = period.last_interaction_at ? parseApiTimestamp(period.last_interaction_at) : NaN;
  const known = [first, last].filter((ms) => Number.isFinite(ms));
  if (!known.length) return null;
  const format = (ms: number) =>
    new Date(ms).toLocaleDateString(localeBcp47(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone,
    });
  const start = format(Math.min(...known));
  const end = format(Math.max(...known));
  return start === end ? start : `${start} – ${end}`;
}

/** Trigger a browser download of a text payload. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
