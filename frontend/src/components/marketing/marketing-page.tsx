import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useMemo } from "react";

import { useLocale } from "@/components/locale-context";
import {
  marketingPageContent,
  marketingPageUi,
  type MarketingPageSlug,
} from "@/lib/marketing-pages-i18n";
import { MarketingLayout } from "./marketing-layout";

export function MarketingPage({ slug }: { slug: MarketingPageSlug }) {
  const { locale } = useLocale();
  const content = useMemo(() => marketingPageContent(locale, slug), [locale, slug]);
  const ui = useMemo(() => marketingPageUi(locale), [locale]);

  return (
    <MarketingLayout>
      <article className="border-b-4 border-foreground newsprint-texture">
        <div className="max-w-screen-xl mx-auto px-4 py-16 lg:py-20">
          <div>
            <p className="font-mono-data uppercase text-xs tracking-widest text-muted-foreground">
              {content.eyebrow}
            </p>
            <h1 className="marketing-page-title mt-3 max-w-5xl font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">
              {content.title}
            </h1>
            <p className="mt-6 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">
              {content.lede}
            </p>
          </div>

          <div className="mt-12 max-w-3xl space-y-10 border-t border-foreground pt-10">
            {content.sections.map((section, index) => (
              <section key={index}>
                {section.heading ? (
                  <h2 className="font-serif-display font-bold text-2xl mb-3">{section.heading}</h2>
                ) : null}
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
                      <li
                        key={item}
                        className="flex items-start gap-3 font-body text-base leading-snug"
                      >
                        <Check
                          className="h-5 w-5 mt-0.5 shrink-0 text-[color:var(--editorial-red)]"
                          strokeWidth={2}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-foreground/30">
            <Link
              to="/"
              className="font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
            >
              {ui.backToHome}
            </Link>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
