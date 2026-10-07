import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  FileText,
  GitCompare,
  Quote,
  ShieldCheck,
  ArrowRight,
  Upload,
} from "lucide-react";
import { useMemo } from "react";

import { useLocale } from "@/components/locale-context";
import {
  featuresPageCopy,
  marketingPageContent,
  marketingPageUi,
} from "@/lib/marketing-pages-i18n";
import { editorEntryPath } from "@/lib/require-auth";
import { MarketingLayout } from "./marketing-layout";

const featureIcons = [BookOpen, FileText, GitCompare, Quote, ShieldCheck];

const featureLearnMore: Record<string, string> = {
  "01": "/workflow",
  "02": "/workflow",
  "03": "/integrity",
  "04": "/integrity",
  "05": "/integrity",
};

function FeaturesHubDiagram({
  copy,
  ui,
}: {
  copy: ReturnType<typeof featuresPageCopy>;
  ui: ReturnType<typeof marketingPageUi>;
}) {
  const cx = 200;
  const cy = 200;
  const radius = 130;

  return (
    <div className="border border-foreground bg-background p-4 sm:p-8">
      <div className="flex flex-col lg:flex-row gap-8 items-center">
        <div className="w-full lg:w-1/2 flex justify-center">
          <svg
            viewBox="0 0 400 400"
            className="w-full max-w-[400px] h-auto"
            role="img"
            aria-label={copy.hubAria}
          >
            <circle
              cx={cx}
              cy={cy}
              r={radius + 40}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="text-foreground/25"
            />
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-foreground/40"
            />

            {copy.features.map((f) => {
              const rad = ((f.angle - 90) * Math.PI) / 180;
              const nx = cx + radius * Math.cos(rad);
              const ny = cy + radius * Math.sin(rad);
              return (
                <g key={f.n}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={nx}
                    y2={ny}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-foreground/30"
                  />
                  <circle
                    cx={nx}
                    cy={ny}
                    r="28"
                    fill="var(--newsprint, #F9F7F2)"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-foreground"
                  />
                  <text
                    x={nx}
                    y={ny - 4}
                    textAnchor="middle"
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "8px",
                      letterSpacing: "0.08em",
                    }}
                    className="fill-[color:var(--editorial-accent)] uppercase"
                  >
                    {f.n}
                  </text>
                  <text
                    x={nx}
                    y={ny + 10}
                    textAnchor="middle"
                    style={{
                      fontFamily: "'Fraunces', serif",
                      fontSize: "8px",
                      fontWeight: 700,
                    }}
                    className="fill-current"
                  >
                    {f.hubLabel}
                  </text>
                </g>
              );
            })}

            <rect
              x={cx - 55}
              y={cy - 40}
              width={110}
              height={80}
              fill="var(--foreground)"
              className="text-foreground"
            />
            <text
              x={cx}
              y={cy - 12}
              textAnchor="middle"
              fill="var(--newsprint, #F9F7F2)"
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "9px",
                letterSpacing: "0.12em",
              }}
            >
              {copy.hubCenterManuscript}
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fill="var(--newsprint, #F9F7F2)"
              style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 900 }}
            >
              {copy.hubCenterLatex}
            </text>
            <text
              x={cx}
              y={cy + 26}
              textAnchor="middle"
              fill="var(--newsprint, #F9F7F2)"
              style={{ fontFamily: "Georgia, serif", fontSize: "9px", fontStyle: "italic" }}
            >
              {copy.hubCenterSource}
            </text>
          </svg>
        </div>

        <div className="w-full lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {copy.features.map(({ n, title, body }, index) => {
            const Icon = featureIcons[index] ?? BookOpen;
            return (
              <article
                key={n}
                className="border border-foreground p-5 transition-colors hover:bg-foreground/[0.04] group"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 border border-foreground flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                    <Icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <span className="font-mono-data text-[10px] uppercase tracking-widest text-[color:var(--editorial-accent)]">
                    {copy.noLabel} {n}
                  </span>
                </div>
                <h3 className="font-serif-display font-bold text-xl leading-tight">{title}</h3>
                <p className="font-body text-sm text-muted-foreground mt-2 leading-relaxed">
                  {body}
                </p>
                <div className="mt-4">
                  <Link
                    to={featureLearnMore[n] ?? "/workflow"}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 font-sans-ui text-[10px] uppercase tracking-widest text-muted-foreground hover:text-[color:var(--editorial-accent)] underline-offset-4 hover:underline"
                  >
                    {ui.learnMore}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FeaturesPage() {
  const { locale } = useLocale();
  const content = useMemo(() => marketingPageContent(locale, "features"), [locale]);
  const ui = useMemo(() => marketingPageUi(locale), [locale]);
  const copy = useMemo(() => featuresPageCopy(locale), [locale]);

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
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                to={editorEntryPath()}
                className="inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-background hover:text-foreground transition-colors min-h-[44px]"
              >
                <Upload className="h-4 w-4" strokeWidth={1.5} /> {ui.tryIt}
              </Link>
              <Link
                to="/workflow"
                className="inline-flex items-center justify-center gap-2 border border-foreground bg-transparent px-6 py-3 font-sans-ui uppercase text-xs tracking-widest hover:bg-foreground hover:text-background transition-colors min-h-[44px]"
              >
                {ui.learnMore} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </div>
          </div>

          <div className="mt-12">
            <div className="flex items-center justify-between border-b border-foreground pb-3 mb-6">
              <span className="font-mono-data uppercase text-xs tracking-widest">
                {copy.figCaption}
              </span>
              <span className="font-mono-data uppercase text-[10px] tracking-widest text-muted-foreground hidden sm:inline">
                {copy.figNote}
              </span>
            </div>
            <FeaturesHubDiagram copy={copy} ui={ui} />
          </div>

          <div className="mt-12 pt-8 border-t border-foreground/30 flex flex-wrap gap-6">
            <Link
              to="/"
              className="font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-accent)] hover:underline underline-offset-4"
            >
              {ui.backToHome}
            </Link>
            <Link
              to="/workflow"
              className="inline-flex items-center gap-2 font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-accent)]"
            >
              {ui.seeWorkflow} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
