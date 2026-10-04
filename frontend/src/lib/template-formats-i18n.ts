import type { UiLanguage } from "@/lib/researcher-profile";

/** Publisher formats of the built-in gallery templates (`format` in the template registry). */
export const TEMPLATE_FORMATS = [
  { value: "ieee", label: "IEEE" },
  { value: "springer", label: "Springer" },
  { value: "elsevier", label: "Elsevier" },
  { value: "acm", label: "ACM" },
] as const;

export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]["value"];

const VENUE_LABELS: Record<UiLanguage, Record<string, string>> = {
  en: { journal: "Journal", conference: "Conference" },
  vi: { journal: "Tạp chí", conference: "Hội nghị" },
};

export function templateFormatLabel(format: string): string {
  const key = format.trim().toLowerCase();
  return TEMPLATE_FORMATS.find((item) => item.value === key)?.label ?? format.trim().toUpperCase();
}

export function templateVenueLabel(venue: string, locale: UiLanguage): string {
  const key = venue.trim().toLowerCase();
  return VENUE_LABELS[locale][key] ?? venue.trim();
}

/** Gallery card eyebrow such as "ACM · Conference"; falls back to the author when both are empty. */
export function templateEyebrow(
  item: { format?: string | null; venue?: string | null; author?: string | null },
  locale: UiLanguage,
): string {
  const parts = [
    item.format?.trim() ? templateFormatLabel(item.format) : "",
    item.venue?.trim() ? templateVenueLabel(item.venue, locale) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : (item.author ?? "");
}
