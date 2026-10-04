import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  User,
  Loader2,
  Save,
  Sparkles,
  BookOpen,
  Brain,
  Settings2,
  Shield,
  Globe,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { getSession } from "@/lib/auth-store";
import { ProfileContentSkeleton } from "@/components/workspace/workspace-content-skeleton";
import { fetchResearcherProfile, updateResearcherProfile } from "@/lib/api/profile-api";
import {
  initialsFromName,
  profileCompleteness,
  type ResearcherProfile,
} from "@/lib/researcher-profile";
import { profileCopy } from "@/lib/profile-i18n";
import { formatDateTime } from "@/lib/date-i18n";
import { useLocale } from "@/components/locale-context";
import { getStoredLocale } from "@/lib/locale-store";
import { buildProfilePatch, validateProfileBeforeSave } from "@/lib/profile-patch";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

export const Route = createFileRoute("/_workspace/profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Researcher Profile — Arionear" },
      {
        name: "description",
        content: "Manage your researcher profile, AI preferences, and editorial workflow defaults.",
      },
    ],
  }),
  component: ProfilePage,
});

type SectionId = "identity" | "research" | "writing" | "ai" | "workflow" | "privacy";

function ProfilePage() {
  const sessionUser = getSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ResearcherProfile | null>(null);
  const [baseline, setBaseline] = useState<ResearcherProfile | null>(null);

  const { locale, setLocale } = useLocale();
  const t = useMemo(() => profileCopy(locale), [locale]);
  const isDirty = useMemo(() => {
    if (!form || !baseline) return false;
    if (form.name.trim() !== baseline.name.trim()) return true;
    return Object.keys(buildProfilePatch(form, baseline)).length > 0;
  }, [form, baseline]);
  const completeness = form ? profileCompleteness(form) : 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchResearcherProfile()
      .then((profile) => {
        if (cancelled) return;
        setForm({ ...profile });
        setBaseline({ ...profile });
        setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError(profileCopy(getStoredLocale()).loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Fetch once on mount — do not depend on locale strings (would refetch on every toggle).
  }, []);

  const patch = useCallback(
    <K extends keyof ResearcherProfile>(key: K, value: ResearcherProfile[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const handleSave = async () => {
    if (!form || !baseline || saving) return;
    const validationError = validateProfileBeforeSave(form);
    if (validationError) {
      toast.error(t.saveError, { description: validationError });
      return;
    }
    const payload = buildProfilePatch(form, baseline);
    if (!Object.keys(payload).length) return;

    setSaving(true);
    try {
      const updated = await updateResearcherProfile(payload);
      setForm({ ...updated });
      setBaseline({ ...updated });
      setLocale(updated.ui_language);
      toast.success(t.saved);
    } catch (e) {
      toast.error(t.saveError, {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="workspace-main-header profile-sticky-header profile-page-header flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-background/90 px-4 backdrop-blur-md md:px-8">
        <div className="profile-page-header-text min-w-0">
          <h1 className="truncate font-serif-display text-lg font-bold tracking-tight md:text-xl">
            {t.pageTitle}
          </h1>
        </div>
        <div className="profile-page-header-actions flex shrink-0 items-center gap-2 md:gap-3">
          {isDirty && (
            <span className="profile-unsaved-indicator text-xs text-amber-600 dark:text-amber-400">
              {t.unsaved}
            </span>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={loading || !form || !isDirty || saving}
            className="profile-save-btn inline-flex items-center gap-2 border border-foreground bg-foreground px-3 py-2 font-sans-ui text-[10px] font-medium uppercase tracking-widest text-background transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 md:px-4 md:text-xs"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="profile-save-label md:hidden">{saving ? t.saving : t.save}</span>
            <span className="profile-save-label hidden md:inline">
              {saving ? t.saving : t.save}
            </span>
          </button>
        </div>
      </header>

      {loading ? (
        <ProfileContentSkeleton className="flex-1" />
      ) : loadError || !form ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">{loadError ?? t.loadError}</p>
          <Link to="/projects" className="text-sm text-primary hover:underline">
            {t.navProjects}
          </Link>
        </div>
      ) : (
        <div className="profile-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 md:px-8 md:py-6">
          <p className="mb-6 text-sm text-muted-foreground">{t.pageSubtitle}</p>
          <section className="profile-hero-card mb-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <Avatar className="h-20 w-20 border-2 border-primary/20 shadow-md">
                {form.avatar_url ? <AvatarImage src={form.avatar_url} alt={form.name} /> : null}
                <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                  {initialsFromName(form.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold">{form.name}</h2>
                <p className="truncate text-sm text-muted-foreground">{form.email}</p>
                {form.affiliation && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">{form.affiliation}</p>
                )}
                {form.research_field && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    <Sparkles className="h-3 w-3" />
                    {form.research_field}
                  </p>
                )}
              </div>
              <div className="profile-completeness shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {t.completeness}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="profile-completeness-bar">
                    <div
                      className="profile-completeness-fill"
                      style={{ width: `${completeness}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{completeness}%</span>
                </div>
              </div>
            </div>
          </section>

          <div className="profile-form-grid space-y-10 pb-16">
            <ProfileSection id="identity" title={t.sections.identity} icon={User}>
              <Field label={t.fields.name}>
                <input
                  className="profile-input"
                  value={form.name}
                  onChange={(e) => patch("name", e.target.value.trimStart())}
                />
              </Field>
              <Field label={t.fields.email}>
                <input
                  className="profile-input profile-input-readonly"
                  value={form.email}
                  readOnly
                />
              </Field>
              <Field label={t.fields.affiliation}>
                <input
                  className="profile-input"
                  value={form.affiliation ?? ""}
                  onChange={(e) => patch("affiliation", e.target.value || null)}
                />
              </Field>
              <Field label={t.fields.department}>
                <input
                  className="profile-input"
                  value={form.department ?? ""}
                  onChange={(e) => patch("department", e.target.value || null)}
                />
              </Field>
              <Field label={t.fields.position}>
                <input
                  className="profile-input"
                  value={form.position ?? ""}
                  onChange={(e) => patch("position", e.target.value || null)}
                  placeholder="PhD candidate, Assistant Professor…"
                />
              </Field>
              <Field label={t.fields.avatar_url}>
                <input
                  className="profile-input"
                  value={form.avatar_url ?? ""}
                  onChange={(e) => patch("avatar_url", e.target.value || null)}
                  placeholder="https://…"
                />
              </Field>
            </ProfileSection>

            <ProfileSection id="research" title={t.sections.research} icon={BookOpen}>
              <Field label={t.fields.research_field}>
                <input
                  className="profile-input"
                  value={form.research_field ?? ""}
                  onChange={(e) => patch("research_field", e.target.value || null)}
                  placeholder="Machine learning, Public health…"
                />
              </Field>
              <Field label={t.fields.native_language}>
                <input
                  className="profile-input"
                  value={form.native_language ?? ""}
                  onChange={(e) => patch("native_language", e.target.value || null)}
                  placeholder="Vietnamese, English…"
                />
              </Field>
              <Field label={t.fields.orcid} hint={t.hints.orcid}>
                <input
                  className="profile-input"
                  value={form.orcid ?? ""}
                  onChange={(e) => patch("orcid", e.target.value || null)}
                  placeholder="0000-0000-0000-0000"
                />
              </Field>
              <Field label={t.fields.google_scholar}>
                <input
                  className="profile-input"
                  value={form.google_scholar_url ?? ""}
                  onChange={(e) => patch("google_scholar_url", e.target.value || null)}
                  placeholder="https://scholar.google.com/…"
                />
              </Field>
              <Field label={t.fields.paper_type}>
                <select
                  className="profile-input"
                  value={form.paper_type}
                  onChange={(e) =>
                    patch("paper_type", e.target.value as ResearcherProfile["paper_type"])
                  }
                >
                  <option value="journal">Journal article</option>
                  <option value="conference">Conference paper</option>
                  <option value="thesis">Thesis / dissertation</option>
                  <option value="report">Technical report</option>
                </select>
              </Field>
              <Field label={t.fields.target_venue}>
                <input
                  className="profile-input"
                  value={form.target_venue ?? ""}
                  onChange={(e) => patch("target_venue", e.target.value || null)}
                  placeholder="Nature, IEEE TVT, CHI…"
                />
              </Field>
              <Field label={t.fields.target_deadline}>
                <input
                  type="date"
                  className="profile-input"
                  value={form.target_deadline ?? ""}
                  onChange={(e) => patch("target_deadline", e.target.value || null)}
                />
              </Field>
            </ProfileSection>

            <ProfileSection id="writing" title={t.sections.writing} icon={Globe}>
              <Field label={t.fields.default_template}>
                <select
                  className="profile-input"
                  value={form.default_template}
                  onChange={(e) =>
                    patch(
                      "default_template",
                      e.target.value as ResearcherProfile["default_template"],
                    )
                  }
                >
                  <option value="imrad">IMRaD (article)</option>
                  <option value="ieee">IEEE conference</option>
                  <option value="acm">ACM</option>
                  <option value="springer">Springer LNCS</option>
                  <option value="blank">Blank</option>
                </select>
              </Field>
              <Field label={t.fields.citation_style}>
                <select
                  className="profile-input"
                  value={form.citation_style}
                  onChange={(e) =>
                    patch("citation_style", e.target.value as ResearcherProfile["citation_style"])
                  }
                >
                  <option value="ieee">IEEE</option>
                  <option value="apa">APA</option>
                  <option value="vancouver">Vancouver</option>
                  <option value="chicago">Chicago</option>
                  <option value="nature">Nature</option>
                </select>
              </Field>
              <Field label={t.fields.writing_locale}>
                <select
                  className="profile-input"
                  value={form.writing_locale}
                  onChange={(e) =>
                    patch("writing_locale", e.target.value as ResearcherProfile["writing_locale"])
                  }
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                </select>
              </Field>
              <Field label={t.fields.ui_language}>
                <select
                  className="profile-input"
                  value={form.ui_language}
                  onChange={(e) => {
                    const lang = e.target.value as ResearcherProfile["ui_language"];
                    patch("ui_language", lang);
                    setLocale(lang);
                  }}
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </Field>
              <Field label={t.fields.timezone}>
                <select
                  className="profile-input"
                  value={form.timezone}
                  onChange={(e) => patch("timezone", e.target.value)}
                >
                  <option value="Asia/Bangkok">Asia/Bangkok (ICT)</option>
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho Chi Minh</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New York</option>
                  <option value="UTC">UTC</option>
                </select>
              </Field>
            </ProfileSection>

            <ProfileSection id="ai" title={t.sections.ai} icon={Brain}>
              <Field label={t.fields.default_llm_provider}>
                <select
                  className="profile-input"
                  value={form.default_llm_provider}
                  onChange={(e) =>
                    patch(
                      "default_llm_provider",
                      e.target.value as ResearcherProfile["default_llm_provider"],
                    )
                  }
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google (Gemini)</option>
                  <option value="zai">Z.AI (GLM)</option>
                </select>
              </Field>
              <Field label={t.fields.default_llm_model}>
                <input
                  className="profile-input"
                  value={form.default_llm_model ?? ""}
                  onChange={(e) => patch("default_llm_model", e.target.value || null)}
                  placeholder="e.g. openai/gpt-4o-mini"
                />
              </Field>
              <Field label={t.fields.rewrite_intensity}>
                <select
                  className="profile-input"
                  value={form.rewrite_intensity}
                  onChange={(e) =>
                    patch(
                      "rewrite_intensity",
                      e.target.value as ResearcherProfile["rewrite_intensity"],
                    )
                  }
                >
                  <option value="light">Light — polish phrasing</option>
                  <option value="moderate">Moderate — restructure sentences</option>
                  <option value="strong">Strong — deeper rewrites</option>
                </select>
              </Field>
              <Field label={t.fields.integrity_strictness} hint={t.hints.integrity}>
                <select
                  className="profile-input"
                  value={form.integrity_strictness}
                  onChange={(e) =>
                    patch(
                      "integrity_strictness",
                      e.target.value as ResearcherProfile["integrity_strictness"],
                    )
                  }
                >
                  <option value="relaxed">Relaxed</option>
                  <option value="standard">Standard</option>
                  <option value="strict">Strict</option>
                </select>
              </Field>
            </ProfileSection>

            <ProfileSection id="workflow" title={t.sections.workflow} icon={Settings2}>
              <ToggleField
                label={t.fields.auto_save}
                hint={t.hints.auto_save}
                checked={form.auto_save}
                onCheckedChange={(v) => patch("auto_save", v)}
              />
              <ToggleField
                label={t.fields.auto_compile}
                hint={t.hints.auto_compile}
                checked={form.auto_compile}
                onCheckedChange={(v) => patch("auto_compile", v)}
              />
              <Field label={t.fields.synctex_highlight_ms}>
                <input
                  type="range"
                  min={1000}
                  max={15000}
                  step={500}
                  className="profile-range w-full"
                  value={form.synctex_highlight_ms}
                  onChange={(e) => patch("synctex_highlight_ms", Number(e.target.value))}
                />
                <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                  {(form.synctex_highlight_ms / 1000).toFixed(1)}s
                </span>
              </Field>
              <ToggleField
                label={t.fields.store_drafts}
                checked={form.store_drafts}
                onCheckedChange={(v) => patch("store_drafts", v)}
              />
            </ProfileSection>

            <ProfileSection id="privacy" title={t.sections.privacy} icon={Shield}>
              <ToggleField
                label={t.fields.telemetry_opt_in}
                hint={t.hints.telemetry}
                checked={form.telemetry_opt_in}
                onCheckedChange={(v) => patch("telemetry_opt_in", v)}
              />
              {sessionUser && (
                <p className="col-span-full text-xs text-muted-foreground">
                  {t.footer.signedInAs(sessionUser.email)}
                  {form.updated_at && (
                    <>
                      {" "}
                      · {t.footer.lastUpdated} {formatDateTime(form.updated_at, locale)}
                    </>
                  )}
                </p>
              )}
            </ProfileSection>
          </div>
        </div>
      )}
    </main>
  );
}

function ProfileSection({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: SectionId;
  title: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <section id={`profile-section-${id}`} className="profile-section-card scroll-mt-24">
      <div className="profile-section-head">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      <div className="profile-section-body">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="profile-field">
      <span className="profile-field-label">{label}</span>
      {children}
      {hint && <span className="profile-field-hint">{hint}</span>}
    </label>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="profile-toggle-field">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
