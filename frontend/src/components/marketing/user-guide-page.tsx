import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { guideCopy } from "@/lib/guide-i18n";
import { MarketingLayout } from "./marketing-layout";

export function UserGuidePage() {
  const { locale } = useLocale();
  const g = useMemo(() => guideCopy(locale), [locale]);

  return (
    <MarketingLayout>
      <article className="user-guide-page border-b-4 border-foreground newsprint-texture">
        <div className="max-w-screen-xl mx-auto px-4 py-16 lg:py-20">
          <div className="lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
            <nav
              className="user-guide-toc hidden lg:block sticky top-28 self-start"
              aria-label={g.tocTitle}
            >
              <p className="font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground border-b border-foreground pb-2">
                {g.tocTitle}
              </p>
              <ol className="mt-4 space-y-2">
                {g.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="font-sans-ui text-xs leading-snug text-foreground/80 hover:text-[color:var(--editorial-red)] transition-colors"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
              <div className="mt-8 pt-6 border-t border-foreground/20">
                <p className="font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  {g.relatedTitle}
                </p>
                <ul className="space-y-2">
                  {g.relatedLinks.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        className="font-body text-sm hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>

            <div className="min-w-0">
              <p className="font-mono-data uppercase text-xs tracking-widest text-muted-foreground">{g.eyebrow}</p>
              <h1 className="marketing-page-title mt-3 max-w-4xl font-serif-display font-black text-4xl lg:text-5xl tracking-tighter">
                {g.title}
              </h1>
              <p className="mt-6 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">{g.lede}</p>

              <Link
                to="/projects"
                className="mt-8 inline-flex items-center gap-2 border border-foreground bg-foreground text-background px-5 py-2.5 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[44px]"
              >
                {g.openEditorCta} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>

              <div className="mt-14 space-y-14 border-t border-foreground pt-12">
                {g.sections.map((section) => (
                  <section key={section.id} id={section.id} className="user-guide-section scroll-mt-28">
                    <h2 className="font-serif-display font-bold text-2xl mb-4 tracking-tight">{section.heading}</h2>
                    {section.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="font-body text-base leading-relaxed text-muted-foreground mb-3 last:mb-0"
                      >
                        {paragraph}
                      </p>
                    ))}
                    {section.bullets?.length ? (
                      <ul className="mt-4 space-y-3">
                        {section.bullets.map((item) => (
                          <li key={item} className="flex items-start gap-3 font-body text-base leading-snug">
                            <Check
                              className="h-5 w-5 mt-0.5 shrink-0 text-[color:var(--editorial-red)]"
                              strokeWidth={2}
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {section.samples?.length ? (
                      <div className="mt-6">
                        <p className="font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                          {g.samplesTitle}
                        </p>
                        <div className="user-guide-samples grid gap-3 sm:grid-cols-2">
                          {section.samples.map((sample) => (
                            <div key={sample.prompt} className="user-guide-sample-card border border-foreground p-4">
                              <span className="user-guide-sample-task">{sample.task}</span>
                              <p className="mt-2 font-body text-sm leading-relaxed italic">“{sample.prompt}”</p>
                              <p className="mt-2 font-mono-data text-[10px] uppercase tracking-wide text-muted-foreground">
                                → {sample.expect}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {section.shortcuts?.length ? (
                      <div className="mt-6 user-guide-shortcuts border border-foreground">
                        <div className="user-guide-shortcuts-head font-mono-data text-[10px] uppercase tracking-widest px-4 py-2 border-b border-foreground bg-foreground/[0.03]">
                          {g.shortcutsTitle}
                        </div>
                        <ul className="divide-y divide-foreground/10">
                          {section.shortcuts.map((shortcut) => (
                            <li
                              key={shortcut.keys}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-4 py-3"
                            >
                              <kbd className="user-guide-kbd">{shortcut.keys}</kbd>
                              <span className="font-body text-sm text-muted-foreground">{shortcut.description}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>

              <div className="mt-12 pt-8 border-t border-foreground/30 flex flex-wrap gap-4">
                <Link
                  to="/"
                  className="font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
                >
                  ← {locale === "vi" ? "Về trang chủ" : "Back to home"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
