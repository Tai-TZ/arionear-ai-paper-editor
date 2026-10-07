import { EdicoWordmark } from "@/components/edico-wordmark";
import { Link } from "@tanstack/react-router";
import { useLocale } from "@/components/locale-context";
import { editorCopy, formatMastheadDate } from "@/lib/editor-i18n";
import { getSession } from "@/lib/auth-store";
import { DefenseMastheadPrefs } from "@/components/defense/defense-masthead-prefs";
import type { ResearcherProfile } from "@/lib/researcher-profile";

export function EdicoMasthead({
  className = "",
  integrityStrictness = "standard",
}: {
  className?: string;
  integrityStrictness?: ResearcherProfile["integrity_strictness"];
}) {
  const user = getSession();
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const integrityLabel =
    integrityStrictness === "strict"
      ? t.masthead.integrityStrict
      : integrityStrictness === "relaxed"
        ? t.masthead.integrityRelaxed
        : t.masthead.integrityOn;

  return (
    <div
      className={`editor-masthead flex shrink-0 items-center justify-between border-b px-4 py-1.5 text-[10px] font-mono-data uppercase tracking-widest ${className}`}
    >
      <div className="flex items-center gap-3">
        <Link to="/" className="hover:text-[color:var(--editorial-accent)] transition-colors">
          <EdicoWordmark />
        </Link>
        <span className="opacity-40">·</span>
        <Link
          to="/projects"
          className="hover:text-[color:var(--editorial-accent)] transition-colors"
        >
          {t.masthead.projects}
        </Link>
        <span className="opacity-40">·</span>
        <Link
          to="/profile"
          className="hover:text-[color:var(--editorial-accent)] transition-colors"
        >
          {t.masthead.profile}
        </Link>
        <span className="opacity-40">·</span>
        <span>{t.masthead.latexWorkspace}</span>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="hidden sm:inline opacity-80 normal-case tracking-normal font-sans-ui text-[11px]">
              {user.name}
            </span>
            <span className="opacity-40">·</span>
          </>
        )}
        <span className="hidden sm:inline opacity-70">{formatMastheadDate(locale)}</span>
        <span className="hidden sm:inline opacity-40">·</span>
        <span className="text-[color:var(--editorial-accent)]">
          {t.masthead.integrityGuard} · {integrityLabel}
        </span>
        <DefenseMastheadPrefs />
      </div>
    </div>
  );
}
