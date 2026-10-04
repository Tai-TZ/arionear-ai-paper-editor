import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { aboutPageCopy, marketingPageContent, marketingPageUi } from "@/lib/marketing-pages-i18n";
import { EditorialBoardFigure } from "./editorial-board-figure";
import { MarketingLayout } from "./marketing-layout";

const teamMembers = [{ name: "Nguyễn Thành Tài", tag: "Founder" }];

export function AboutPage() {
  const { locale } = useLocale();
  const content = useMemo(() => marketingPageContent(locale, "about"), [locale]);
  const ui = useMemo(() => marketingPageUi(locale), [locale]);
  const copy = useMemo(() => aboutPageCopy(locale), [locale]);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <MarketingLayout>
      <article className="border-b-4 border-foreground newsprint-texture">
        <div className="max-w-screen-xl mx-auto px-4 py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-0">
            <div className="lg:col-span-5 lg:border-r border-foreground lg:pr-12">
              <p className="font-mono-data uppercase text-xs tracking-widest text-muted-foreground">
                {content.eyebrow}
              </p>
              <h1 className="marketing-page-title mt-3 font-serif-display font-black text-4xl lg:text-5xl tracking-tighter leading-[0.95]">
                {content.title}
              </h1>
              <p className="mt-6 font-body text-lg leading-relaxed text-muted-foreground text-justify">
                {content.lede}
              </p>
              {content.sections[0]?.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-4 font-body text-base leading-relaxed text-muted-foreground text-justify"
                >
                  {paragraph}
                </p>
              ))}
              <div className="mt-8 border border-foreground p-6 bg-background">
                <p className="font-mono-data uppercase text-[10px] tracking-widest text-muted-foreground mb-2">
                  {copy.publishedBy}
                </p>
                <p className="font-serif-display font-bold text-xl">{copy.teamName}</p>
                <p className="font-body italic text-sm text-muted-foreground mt-1">
                  {copy.teamSubtitle}
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 lg:pl-12">
              <div className="flex items-end justify-between border-b border-foreground pb-3 mb-8">
                <h2 className="font-serif-display font-black text-3xl tracking-tighter">
                  {copy.mastheadTitle}
                </h2>
                <span className="font-mono-data uppercase text-[10px] tracking-widest text-muted-foreground">
                  {copy.membersLabel(teamMembers.length)}
                </span>
              </div>

              <ul className="divide-y divide-foreground border-t border-foreground">
                {teamMembers.map((member, index) => (
                  <li key={member.name}>
                    <button
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={`about-masthead-row grid w-full grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-6 items-center py-6 px-2 -mx-2 text-left transition-colors ${
                        activeIndex === index ? "is-active" : ""
                      }`}
                    >
                      <span className="about-masthead-index font-mono-data text-3xl font-bold text-muted-foreground/40 transition-colors w-12">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="font-serif-display font-bold text-2xl tracking-tight">
                          {member.name}
                        </p>
                        <p className="mt-1 font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground">
                          {copy.editorRoles[index]}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <span className="inline-block border border-foreground px-3 py-1.5 font-mono-data text-xs tracking-widest bg-background">
                          {member.tag}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              <EditorialBoardFigure
                copy={copy}
                activeIndex={activeIndex}
                onActiveIndexChange={setActiveIndex}
              />
            </div>
          </div>

          <div className="mt-16 pt-8 border-t border-foreground/30">
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
