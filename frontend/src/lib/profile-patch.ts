import type { ResearcherProfile, ResearcherProfilePatch } from "@/lib/researcher-profile";

const PROFILE_PATCH_KEYS = new Set<keyof ResearcherProfilePatch>([
  "name",
  "affiliation",
  "department",
  "position",
  "native_language",
  "research_field",
  "orcid",
  "google_scholar_url",
  "avatar_url",
  "timezone",
  "ui_language",
  "paper_type",
  "target_venue",
  "target_deadline",
  "default_template",
  "citation_style",
  "writing_locale",
  "default_llm_provider",
  "default_llm_model",
  "rewrite_intensity",
  "integrity_strictness",
  "auto_compile",
  "auto_save",
  "synctex_highlight_ms",
  "store_drafts",
  "telemetry_opt_in",
]);

function normalizeOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Build a PATCH body with only valid, changed profile fields. */
export function buildProfilePatch(
  form: ResearcherProfile,
  baseline: ResearcherProfile,
): ResearcherProfilePatch {
  const patch: ResearcherProfilePatch = {};

  for (const key of PROFILE_PATCH_KEYS) {
    const next = form[key];
    const prev = baseline[key];
    if (Object.is(next, prev)) continue;

    if (key === "name") {
      const trimmed = typeof next === "string" ? next.trim() : "";
      if (!trimmed) continue;
      patch.name = trimmed;
      continue;
    }

    if (typeof next === "string") {
      const normalized = normalizeOptionalString(next);
      const prevNormalized =
        typeof prev === "string" ? (normalizeOptionalString(prev) ?? null) : (prev ?? null);
      if (normalized === prevNormalized) continue;
      (patch as Record<string, unknown>)[key] = normalized;
      continue;
    }

    (patch as Record<string, unknown>)[key] = next;
  }

  return patch;
}

export function validateProfileBeforeSave(form: ResearcherProfile): string | null {
  if (!form.name.trim()) {
    return "Full name is required.";
  }
  return null;
}
