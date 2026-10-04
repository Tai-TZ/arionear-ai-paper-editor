import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  BookOpen,
  Quote,
  ShieldCheck,
  GitCompare,
  ArrowRight,
  Upload,
  Eye,
  Lock,
  PenLine,
  Check,
  X,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { HeroPeerReviewFigure } from "@/components/marketing/hero-figure";
import { useLocale } from "@/components/locale-provider";
import { editorEntryPath } from "@/lib/require-auth";
import { marketingCopy } from "@/lib/marketing-i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Arionear — AI Trợ Lý Viết & Biên Tập Bài Báo Khoa Học" },
      {
        name: "description",
        content:
          "AI academic writing assistant for researchers. Improve academic prose, structure, citations and reviewer replies — without inventing data or results.",
      },
      { property: "og:title", content: "Arionear — Closer to Publication" },
      {
        property: "og:description",
        content: "Help good research get published. AI as editor, human as author.",
      },
    ],
  }),
  component: Index,
});

const FEATURE_ICONS = [BookOpen, FileText, GitCompare, Quote, ShieldCheck] as const;

function Hero() {
  const { locale } = useLocale();
  const m = useMemo(() => marketingCopy(locale), [locale]);
  const h = m.hero;

  return (
    <section className="border-b-4 border-foreground newsprint-texture">
      <div className="hero-split max-w-screen-2xl mx-auto px-4 sm:px-6 grid grid-cols-1 gap-0">
        <div className="hero-split-copy lg:border-r border-foreground p-4 sm:p-6 lg:p-8 xl:p-10">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono-data uppercase text-[10px] sm:text-xs tracking-widest mb-4 sm:mb-6">
            <span className="bg-[color:var(--editorial-red)] text-background px-2 py-1">
              {h.breaking}
            </span>
            <span className="min-w-0">{h.deskEdition}</span>
          </div>
          <h1 className="hero-headline font-serif-display font-black tracking-tighter text-[2.35rem] leading-[0.95] sm:text-6xl sm:leading-none lg:text-[4.5rem] xl:text-[5.5rem] 2xl:text-[6.5rem]">
            {locale === "vi" ? (
              <>
                <span className="hero-headline-vi-fluid inline lg:hidden">
                  Nghiên cứu <em className="italic font-serif-display">Xứng đáng</em> được đọc công
                  bằng.
                </span>
                <span className="hidden lg:inline">
                  Nghiên cứu
                  <br />
                  <em className="italic font-serif-display">Xứng đáng</em>
                  <br />
                  được đọc
                  <br />
                  công bằng.
                </span>
              </>
            ) : (
              <>
                {h.headline}
                <em className="italic font-serif-display">{h.headlineEm}</em>
                {h.headlineEnd}
              </>
            )}
          </h1>
          <div className="mt-6 sm:mt-8 grid grid-cols-1 md:grid-cols-12 gap-6">
            <p className="md:col-span-7 font-body text-base sm:text-lg leading-relaxed text-justify drop-cap">
              {h.lede}
            </p>
            <div className="md:col-span-5 border-l-0 md:border-l border-foreground md:pl-6">
              <div className="font-mono-data uppercase text-[10px] tracking-widest mb-3 pb-2 border-b border-foreground">
                {h.fromEditor}
              </div>
              <p className="font-body italic text-base leading-relaxed">{h.editorQuote}</p>
              <p className="mt-3 font-sans-ui text-xs uppercase tracking-widest">
                {h.editorByline}
              </p>
            </div>
          </div>
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              to={editorEntryPath()}
              className="inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[44px]"
            >
              <Upload className="h-4 w-4" strokeWidth={1.5} /> {h.uploadLatex}
            </Link>
            <Link
              to="/workflow"
              className="inline-flex items-center justify-center gap-2 border border-foreground bg-transparent px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors min-h-[44px]"
            >
              {h.seeWorkflow}
            </Link>
          </div>
        </div>
        <aside className="hero-split-demo p-4 sm:p-6 lg:p-6 xl:p-8 flex flex-col gap-4 sm:gap-5 lg:gap-6">
          <div className="hero-figure-frame border border-foreground p-4 lg:p-6 min-w-0 flex-1">
            <div className="font-mono-data uppercase text-xs tracking-widest mb-3">
              {h.figCaption}
            </div>
            <HeroPeerReviewFigure />
            <p className="font-body italic text-sm lg:text-base mt-4 leading-snug">{h.figNote}</p>
          </div>
          <div className="grid grid-cols-3 border border-foreground shrink-0">
            {h.stats.map((s, i) => (
              <div key={i} className={`p-3 lg:p-4 ${i < 2 ? "border-r border-foreground" : ""}`}>
                <div className="font-mono-data text-xl lg:text-2xl font-bold">{s.k}</div>
                <div className="font-sans-ui text-[10px] lg:text-xs uppercase tracking-widest mt-1 text-muted-foreground">
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function Features() {
  const { locale } = useLocale();
  const m = useMemo(() => marketingCopy(locale), [locale]);
  const f = m.features;

  return (
    <section id="features" className="border-b-4 border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-16">
        <div className="flex items-end justify-between border-b border-foreground pb-4 mb-0">
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">
            {f.sectionTitle}
          </h2>
          <Link
            to="/features"
            className="font-mono-data uppercase text-xs tracking-widest hidden sm:block hover:text-[color:var(--editorial-red)]"
          >
            {f.sectionLink}
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-l border-foreground">
          {f.items.map(({ title, body }, i) => {
            const Icon = FEATURE_ICONS[i]!;
            return (
              <article
                key={title}
                className="p-8 border-r border-b border-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <div className="flex items-center gap-4 mb-5">
                  <div className="h-12 w-12 border border-foreground flex items-center justify-center hover:bg-foreground hover:text-background transition-colors">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <span className="font-mono-data text-xs uppercase tracking-widest">
                    No. {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-serif-display font-bold text-2xl mb-3">{title}</h3>
                <p className="font-body text-base leading-relaxed text-muted-foreground">{body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WorkflowTeaser() {
  const { locale } = useLocale();
  const m = useMemo(() => marketingCopy(locale), [locale]);
  const w = m.workflow;

  return (
    <section id="workflow" className="bg-foreground text-background border-b-4 border-foreground">
      <div className="max-w-screen-xl mx-auto px-4 py-20">
        <div className="flex items-end justify-between border-b border-background/40 pb-4">
          <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">
            {w.sectionTitle}
          </h2>
          <Link
            to="/workflow"
            className="font-mono-data uppercase text-xs tracking-widest hidden sm:block text-neutral-400 hover:text-background"
          >
            {w.sectionLink}
          </Link>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border-l border-background/40">
          {w.steps.map((s) => (
            <li key={s.n} className="p-8 border-r border-b border-background/40">
              <div className="font-mono-data text-[color:var(--editorial-red)] text-sm uppercase tracking-widest mb-4">
                {w.stepLabel} {s.n}
              </div>
              <h3 className="font-serif-display font-bold text-3xl mb-3">{s.t}</h3>
              <p className="font-body text-base leading-relaxed text-neutral-400">{s.b}</p>
            </li>
          ))}
        </ol>
        <div className="text-center mt-10">
          <Link
            to="/workflow"
            className="inline-flex items-center gap-2 font-sans-ui uppercase text-xs tracking-widest text-neutral-300 hover:text-background"
          >
            {w.fullLink} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Integrity() {
  const { locale } = useLocale();
  const m = useMemo(() => marketingCopy(locale), [locale]);
  const ig = m.integrity;
  const icons = [ShieldCheck, Quote, PenLine, Eye, Lock] as const;

  return (
    <section id="integrity" className="border-b-4 border-foreground newsprint-texture">
      <div className="max-w-screen-xl mx-auto px-4 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-0">
          <div className="lg:col-span-5 lg:border-r border-foreground lg:pr-10">
            <span className="font-mono-data uppercase text-xs tracking-widest">
              {ig.policyLabel}
            </span>
            <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter mt-4">
              {ig.titleLine1} <br />
              <em className="italic">{ig.titleEm}</em>
              {ig.titleLine3}
            </h2>
            <p className="font-body text-lg leading-relaxed mt-6 text-justify">{ig.body}</p>
            <Link
              to="/integrity"
              className="mt-6 inline-flex font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
            >
              {ig.readPolicy}
            </Link>
          </div>

          <div className="lg:col-span-7 lg:pl-10">
            <div className="flex items-end justify-between border-b border-foreground pb-3 mb-0">
              <span className="font-mono-data uppercase text-xs tracking-widest">
                {ig.guaranteesLabel}
              </span>
              <span className="font-mono-data uppercase text-[10px] tracking-widest text-muted-foreground hidden sm:inline">
                {ig.sectionRef}
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 border-l border-foreground">
              {ig.items.map(({ n, title, body }, idx) => {
                const Icon = icons[idx]!;
                return (
                  <li
                    key={n}
                    className="p-6 border-r border-b border-foreground hover:bg-foreground/[0.04] transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-10 w-10 border border-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                      </div>
                      <span className="font-mono-data text-[10px] uppercase tracking-widest text-[color:var(--editorial-red)]">
                        § {n}
                      </span>
                    </div>
                    <h3 className="font-serif-display font-bold text-xl leading-tight">{title}</h3>
                    <p className="font-body text-sm text-muted-foreground mt-2 leading-relaxed">
                      {body}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Plans() {
  const { locale } = useLocale();
  const m = useMemo(() => marketingCopy(locale), [locale]);
  const p = m.plans;

  return (
    <section id="pricing" className="border-b-4 border-foreground newsprint-texture">
      <div className="max-w-screen-xl mx-auto px-4 py-16">
        {/* Section header */}
        <div className="flex items-end justify-between border-b border-foreground pb-4 mb-0">
          <div>
            <span className="font-mono-data uppercase text-xs tracking-widest text-[color:var(--editorial-red)]">
              {p.sectionLabel}
            </span>
            <h2 className="font-serif-display font-black text-4xl lg:text-6xl tracking-tighter mt-1">
              {p.sectionTitle}
            </h2>
          </div>
          <Link
            to="/pricing"
            className="font-mono-data uppercase text-xs tracking-widest hidden sm:block hover:text-[color:var(--editorial-red)]"
          >
            {p.sectionLink}
          </Link>
        </div>

        {/* Two-column plan grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-l border-foreground">
          {/* ── FREE card ── */}
          <article className="p-8 border-r border-b border-foreground">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-mono-data text-xs uppercase tracking-widest text-[color:var(--editorial-red)]">
                § {p.free.tier}
              </span>
            </div>

            {/* Price */}
            <div className="border-b border-foreground pb-6 mb-6">
              <span className="font-serif-display font-black text-5xl tracking-tighter">
                {p.free.price}
              </span>
              <span className="font-mono-data text-sm text-muted-foreground ml-2">
                {p.free.priceSub}
              </span>
              <p className="font-body text-sm text-muted-foreground mt-2">{p.free.tagline}</p>
            </div>

            {/* Included features */}
            <ul className="flex flex-col gap-3 mb-6">
              {p.free.features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <span className="mt-0.5 h-5 w-5 shrink-0 border border-foreground flex items-center justify-center">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  <span className="font-body text-sm leading-snug">{f}</span>
                </li>
              ))}
              {p.free.locked.map((f) => (
                <li key={f} className="flex items-start gap-3 opacity-40">
                  <span className="mt-0.5 h-5 w-5 shrink-0 border border-foreground flex items-center justify-center">
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  <span className="font-body text-sm leading-snug line-through">{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              to={editorEntryPath()}
              className="inline-flex items-center gap-2 border border-foreground px-5 py-2.5 font-sans-ui uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors min-h-[40px]"
            >
              {p.free.cta}
            </Link>
          </article>

          {/* ── PRO card (editorial inverse) ── */}
          <article className="relative p-8 border-r border-b border-foreground bg-foreground text-background">
            {/* "Most popular" ribbon */}
            <div className="absolute top-0 right-0 bg-[color:var(--editorial-red)] px-3 py-1">
              <span className="font-mono-data text-[10px] uppercase tracking-widest text-background">
                {p.pro.badge}
              </span>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <span className="font-mono-data text-xs uppercase tracking-widest text-[color:var(--editorial-red)]">
                § {p.pro.tier}
              </span>
              <Zap className="h-4 w-4 text-[color:var(--editorial-red)]" strokeWidth={1.5} />
            </div>

            {/* Price */}
            <div className="border-b border-background/30 pb-6 mb-6">
              <span className="font-serif-display font-black text-5xl tracking-tighter">
                {p.pro.price}
              </span>
              <span className="font-mono-data text-sm text-background/60 ml-2">
                {p.pro.priceSub}
              </span>
              <p className="font-body text-sm text-background/60 mt-2">{p.pro.tagline}</p>
            </div>

            {/* Features */}
            <ul className="flex flex-col gap-3 mb-6">
              {p.pro.features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <span className="mt-0.5 h-5 w-5 shrink-0 border border-background/40 flex items-center justify-center">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  <span className="font-body text-sm leading-snug">{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 border border-background bg-background text-foreground px-5 py-2.5 font-sans-ui uppercase text-xs tracking-widest hover:bg-transparent hover:text-background transition-colors min-h-[40px]"
            >
              <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
              {p.pro.cta}
            </Link>
          </article>
        </div>

        {/* Editorial footnote */}
        <p className="font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground mt-4 text-center">
          {p.footnote}
        </p>
      </div>
    </section>
  );
}

function Index() {
  return (
    <MarketingLayout showTicker>
      <Hero />
      <Features />
      <WorkflowTeaser />
      <Plans />
      <Integrity />
    </MarketingLayout>
  );
}
