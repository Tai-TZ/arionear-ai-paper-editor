import { Link } from "@tanstack/react-router";
import {
  Upload,
  MessageSquare,
  GitCompare,
  FileOutput,
  ArrowRight,
  User,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import {
  marketingPageContent,
  marketingPageUi,
  workflowPageCopy,
} from "@/lib/marketing-pages-i18n";
import { MarketingLayout } from "./marketing-layout";

const stepIcons = [Upload, MessageSquare, GitCompare, FileOutput];
const legendIcons = [User, ShieldCheck];

function WorkflowDiagram({
  copy,
  ui,
}: {
  copy: ReturnType<typeof workflowPageCopy>;
  ui: ReturnType<typeof marketingPageUi>;
}) {
  return (
    <div className="border border-foreground bg-background p-4 sm:p-8">
      <ol className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-0">
        {copy.steps.map((step, i) => {
          const Icon = stepIcons[i] ?? Upload;
          return (
            <li
              key={step.n}
              className="relative flex flex-col border border-foreground p-6 min-h-[220px] xl:border-r-0 xl:first:border-l xl:last:border-r xl:border-y xl:border-x-0 xl:[&:not(:last-child)]:border-r"
            >
              <span className="absolute top-0 left-0 bg-[color:var(--editorial-red)] text-background font-mono-data text-[10px] uppercase tracking-widest px-2 py-1">
                {ui.stepLabel} {step.n}
              </span>

              {i < copy.steps.length - 1 ? (
                <ArrowRight
                  className="hidden xl:block absolute -right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-foreground z-10 bg-background"
                  strokeWidth={1.5}
                  aria-hidden
                />
              ) : null}

              <div className="mt-6 h-12 w-12 border border-foreground flex items-center justify-center mb-4">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>

              <h3 className="font-serif-display font-bold text-xl leading-tight">{step.title}</h3>
              <p className="font-body text-sm text-muted-foreground mt-2 leading-relaxed flex-1">{step.detail}</p>

              {step.n === "03" ? (
                <p className="mt-4 font-mono-data text-[10px] uppercase tracking-widest text-[color:var(--editorial-red)] border border-dashed border-foreground/40 px-2 py-1.5 text-center">
                  {ui.authorGate}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function WorkflowLegend({ copy }: { copy: ReturnType<typeof workflowPageCopy> }) {
  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-foreground pt-8">
      {copy.legend.map(({ label, desc }, index) => {
        const Icon = legendIcons[index] ?? User;
        return (
          <div key={label} className="flex items-start gap-4 border border-foreground/30 p-5">
            <div className="h-10 w-10 border border-foreground flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-serif-display font-bold text-lg">{label}</p>
              <p className="font-body text-sm text-muted-foreground mt-1">{desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowPage() {
  const { locale } = useLocale();
  const content = useMemo(() => marketingPageContent(locale, "workflow"), [locale]);
  const ui = useMemo(() => marketingPageUi(locale), [locale]);
  const copy = useMemo(() => workflowPageCopy(locale), [locale]);

  return (
    <MarketingLayout>
      <article className="border-b-4 border-foreground newsprint-texture">
        <div className="max-w-screen-xl mx-auto px-4 py-16 lg:py-20">
          <div>
            <p className="font-mono-data uppercase text-xs tracking-widest text-muted-foreground">{content.eyebrow}</p>
            <h1 className="marketing-page-title mt-3 max-w-5xl font-serif-display font-black text-4xl lg:text-6xl tracking-tighter">
              {content.title}
            </h1>
            <p className="mt-6 max-w-3xl font-body text-lg leading-relaxed text-muted-foreground">{content.lede}</p>
          </div>

          <div className="mt-12">
            <div className="flex items-center justify-between border-b border-foreground pb-3 mb-6">
              <span className="font-mono-data uppercase text-xs tracking-widest">{copy.figCaption}</span>
              <span className="font-mono-data uppercase text-[10px] tracking-widest text-muted-foreground hidden sm:inline">
                {copy.figNote}
              </span>
            </div>
            <WorkflowDiagram copy={copy} ui={ui} />
            <WorkflowLegend copy={copy} />
          </div>

          <div className="mt-12 pt-8 border-t border-foreground/30 flex flex-wrap gap-6">
            <Link
              to="/"
              className="font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)] hover:underline underline-offset-4"
            >
              {ui.backToHome}
            </Link>
            <Link
              to="/projects"
              className="inline-flex items-center gap-2 font-sans-ui uppercase text-xs tracking-widest hover:text-[color:var(--editorial-red)]"
            >
              {ui.openEditor} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
