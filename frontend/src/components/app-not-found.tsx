import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { ArionearWordmark } from "@/components/arionear-wordmark";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/components/locale-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { commonCopy } from "@/lib/common-i18n";

export function AppNotFound() {
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale).shell.notFound, [locale]);

  return (
    <div className="app-not-found min-h-[100dvh] bg-background text-foreground">
      <div className="app-not-found-masthead flex items-center justify-between border-b border-foreground/15 px-4 py-3 md:px-6">
        <Link to="/" className="font-serif-display text-xl font-black tracking-tighter md:text-2xl">
          <ArionearWordmark />
        </Link>
        <div className="flex items-center gap-2">
          <LanguageToggle compact className="masthead-language-toggle shrink-0" />
          <ThemeToggle compact className="masthead-theme-toggle" />
        </div>
      </div>

      <div className="app-not-found-body grid min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <aside className="app-not-found-aside hidden lg:flex flex-col justify-between border-r-4 border-foreground bg-foreground p-10 text-background">
          <p className="font-serif-display text-3xl font-bold leading-tight">{t.asideQuote}</p>
          <p className="font-mono-data text-[11px] uppercase tracking-widest opacity-60">
            {t.asideFooter}
          </p>
        </aside>

        <main className="flex flex-col items-center justify-center px-6 py-12 text-center lg:px-12">
          <p className="font-sans-ui text-[11px] uppercase tracking-[0.22em] text-[color:var(--editorial-red)]">
            {t.eyebrow}
          </p>
          <p className="mt-4 font-serif-display text-[clamp(4.5rem,16vw,8rem)] font-black leading-none tracking-tighter">
            {t.code}
          </p>
          <h1 className="mt-4 font-serif-display text-3xl font-bold tracking-tight md:text-4xl">
            {t.title}
          </h1>
          <p className="mt-4 max-w-md font-serif-body text-base leading-relaxed text-foreground/70">
            {t.body}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center justify-center border border-foreground bg-foreground px-5 py-2.5 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-background transition hover:bg-background hover:text-foreground"
            >
              {t.home}
            </Link>
            <Link
              to="/projects"
              className="inline-flex min-h-[44px] items-center justify-center border border-foreground/30 px-5 py-2.5 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-foreground transition hover:border-foreground"
            >
              {t.projects}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
