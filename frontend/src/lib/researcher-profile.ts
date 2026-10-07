export type UiLanguage = "en" | "vi";
export type PaperType = "journal" | "conference" | "thesis" | "report";
export type RewriteIntensity = "light" | "moderate" | "strong";
export type IntegrityStrictness = "relaxed" | "standard" | "strict";
export type CitationStyle = "ieee" | "apa" | "vancouver" | "chicago" | "nature";
export type DefaultTemplate = "imrad" | "ieee" | "acm" | "springer" | "blank";
export type WritingLocale = "en-US" | "en-GB";
export type LlmProviderPref = "openrouter" | "openai" | "anthropic" | "zai" | "google";

export type ResearcherProfile = {
  id: string;
  name: string;
  email: string;
  affiliation?: string | null;
  department?: string | null;
  position?: string | null;
  native_language?: string | null;
  research_field?: string | null;
  orcid?: string | null;
  google_scholar_url?: string | null;
  avatar_url?: string | null;
  timezone: string;
  ui_language: UiLanguage;
  paper_type: PaperType;
  target_venue?: string | null;
  target_deadline?: string | null;
  default_template: DefaultTemplate;
  citation_style: CitationStyle;
  writing_locale: WritingLocale;
  default_llm_provider: LlmProviderPref;
  default_llm_model?: string | null;
  rewrite_intensity: RewriteIntensity;
  integrity_strictness: IntegrityStrictness;
  auto_compile: boolean;
  auto_save: boolean;
  synctex_highlight_ms: number;
  store_drafts: boolean;
  telemetry_opt_in: boolean;
  updated_at?: string | null;
};

export type ResearcherProfilePatch = Partial<
  Omit<ResearcherProfile, "id" | "email" | "updated_at">
>;

const CACHE_KEY = "proofline-researcher-profile";

export function getCachedProfile(): ResearcherProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY) ?? sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResearcherProfile;
  } catch {
    return null;
  }
}

export function setCachedProfile(profile: ResearcherProfile): void {
  if (typeof window === "undefined") return;
  const storage = localStorage.getItem("proofline-access-token") ? localStorage : sessionStorage;
  storage.setItem(CACHE_KEY, JSON.stringify(profile));
}

export function clearProfileCache(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CACHE_KEY);
  sessionStorage.removeItem(CACHE_KEY);
}

export function profileCompleteness(profile: ResearcherProfile): number {
  const checks = [
    profile.name,
    profile.affiliation,
    profile.research_field,
    profile.native_language,
    profile.orcid,
    profile.target_venue,
    profile.department,
    profile.position,
  ];
  const filled = checks.filter((v) => Boolean(v && String(v).trim())).length;
  return Math.round((filled / checks.length) * 100);
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
