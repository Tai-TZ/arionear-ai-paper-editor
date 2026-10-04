import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, User } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/components/locale-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { commonCopy } from "@/lib/common-i18n";
import { getSession, type AuthUser } from "@/lib/auth-store";
import { ArionearWordmark } from "@/components/arionear-wordmark";
import { editorEntryPath } from "@/lib/require-auth";

function navLinkClass(active: boolean) {
  return active
    ? "text-[color:var(--editorial-red)]"
    : "text-foreground hover:text-[color:var(--editorial-red)]";
}

function MarketingTicker() {
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale), [locale]);
  const items = t.ticker;

  return (
    <div className="marketing-ticker bg-foreground text-background border-y border-foreground overflow-hidden">
      <div className="marketing-ticker-track flex whitespace-nowrap animate-[ticker_40s_linear_infinite] py-2 font-mono-data uppercase text-xs tracking-widest">
        {[...items, ...items, ...items].map((item, i) => (
          <span key={i} className="px-6 flex items-center gap-6">
            <span className="inline-block w-1.5 h-1.5 bg-[color:var(--editorial-red)]" />
            {item}
          </span>
        ))}
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-33.333%) } }`}</style>
    </div>
  );
}

function MarketingMobilePrefsDock() {
  return (
    <div className="marketing-mobile-prefs-dock sm:hidden" role="group" aria-label="Preferences">
      <LanguageToggle compact className="marketing-mobile-prefs-lang masthead-language-toggle" />
      <ThemeToggle compact className="marketing-mobile-prefs-theme masthead-theme-toggle" />
    </div>
  );
}

function MarketingMasthead() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale), [locale]);
  const [user, setUser] = useState<AuthUser | null>(() =>
    typeof window === "undefined" ? null : getSession(),
  );

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(locale === "vi" ? "vi-VN" : "en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    [locale],
  );

  useEffect(() => {
    setUser(getSession());
  }, [pathname]);

  const editorPath = user ? "/projects" : editorEntryPath();
  const navLinks = [
    { label: t.nav.features, to: "/features" },
    { label: t.nav.workflow, to: "/workflow" },
    { label: t.nav.templates, to: "/templates" },
    { label: t.nav.pricing, to: "/pricing" },
  ] as const;

  return (
    <header className="marketing-masthead border-b-4 border-foreground bg-background sticky top-0 z-40">
      <div className="marketing-masthead-inner max-w-screen-xl mx-auto px-4">
        <div className="marketing-masthead-meta flex items-center justify-between gap-2 border-b border-foreground/30 py-1.5 sm:py-2 text-[10px] sm:text-[11px] font-mono-data uppercase tracking-widest min-w-0">
          <span className="marketing-masthead-vol shrink-0">{t.masthead.vol}</span>
          <span className="hidden sm:inline">
            {today} · {t.masthead.internationalEdition}
          </span>
          <div className="marketing-masthead-meta-end ml-auto flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            {user ? (
              <span className="marketing-masthead-session inline-flex min-w-0 items-center gap-1">
                <span className="marketing-masthead-signed-in-label hidden sm:inline">
                  {t.masthead.signedIn}
                </span>
                <Link
                  to="/projects"
                  title={user.email}
                  className="truncate max-w-[9rem] sm:max-w-none hover:text-[color:var(--editorial-red)] transition-colors"
                >
                  {user.name}
                </Link>
                <User className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden />
              </span>
            ) : (
              <span className="marketing-masthead-guest hidden sm:inline truncate">
                {t.masthead.guestSignIn}
              </span>
            )}
          </div>
        </div>
        <div className="marketing-masthead-main flex items-center justify-between gap-3 py-3 sm:gap-4 sm:py-5">
          <Link
            to="/"
            className="marketing-masthead-brand font-serif-display text-[1.65rem] sm:text-3xl md:text-5xl font-black leading-none tracking-tighter min-w-0"
          >
            <ArionearWordmark />
          </Link>
          <nav className="hidden md:flex items-center gap-8 font-sans-ui uppercase text-xs tracking-widest">
            {navLinks.map(({ label, to }) => (
              <Link key={to} to={to} className={navLinkClass(pathname === to)}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="marketing-masthead-actions flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="marketing-masthead-prefs-desktop hidden sm:flex items-center gap-2">
              <LanguageToggle compact className="masthead-language-toggle shrink-0" />
              <ThemeToggle compact className="masthead-theme-toggle shrink-0" />
            </div>
            <Link
              to={editorPath}
              className="marketing-masthead-cta inline-flex shrink-0 items-center justify-center gap-1.5 border border-foreground bg-foreground text-background px-2.5 py-2 sm:gap-2 sm:px-4 font-sans-ui uppercase text-[10px] sm:text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[2.5rem] sm:min-h-[44px] whitespace-nowrap"
              title={t.masthead.openEditor}
            >
              <span className="marketing-masthead-cta-label">{t.masthead.openEditor}</span>
              <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function MarketingColophon() {
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale), [locale]);
  const f = t.footer;

  const footerSections = [
    {
      heading: f.sections.desk,
      links: [
        { label: f.links.features, to: "/features" },
        { label: f.links.workflow, to: "/workflow" },
        { label: f.links.templates, to: "/templates" },
        { label: f.links.integrity, to: "/integrity" },
      ],
    },
    {
      heading: f.sections.authors,
      links: [
        { label: f.links.openEditor, to: "/projects" },
        { label: f.links.templates, to: "/templates" },
        { label: f.links.latexGuide, to: "/latex-guide" },
      ],
    },
    {
      heading: f.sections.bureau,
      links: [
        { label: f.links.about, to: "/about" },
        { label: f.links.contact, to: "/contact" },
      ],
    },
    {
      heading: f.sections.legal,
      links: [
        { label: f.links.terms, to: "/terms" },
        { label: f.links.privacy, to: "/privacy" },
        { label: f.links.ethics, to: "/ethics" },
        { label: f.links.dataUse, to: "/data-use" },
      ],
    },
  ];

  return (
    <footer className="bg-background border-t border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2">
          <Link to="/" className="font-serif-display text-3xl font-black tracking-tighter hover:opacity-80">
            <ArionearWordmark />
          </Link>
          <p className="mt-2 font-body italic text-sm">{f.tagline}</p>
          <p className="mt-4 font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground">
            {f.edition} {new Date().getFullYear()}
          </p>
        </div>
        {footerSections.map((section) => (
          <div key={section.heading}>
            <div className="font-mono-data text-xs uppercase tracking-widest border-b border-foreground pb-2">
              {section.heading}
            </div>
            <ul className="mt-3 space-y-2 font-body text-sm">
              {section.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-foreground">
        <div className="max-w-screen-xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 font-mono-data text-[10px] uppercase tracking-widest">
          <span>
            © {new Date().getFullYear()} {f.copyright}
          </span>
          <span>{f.motto}</span>
        </div>
      </div>
    </footer>
  );
}

type MarketingLayoutProps = {
  children: ReactNode;
  showTicker?: boolean;
};

export function MarketingLayout({ children, showTicker = false }: MarketingLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingMasthead />
      <MarketingMobilePrefsDock />
      {showTicker ? <MarketingTicker /> : null}
      <main className="marketing-main">{children}</main>
      <MarketingColophon />
    </div>
  );
}
