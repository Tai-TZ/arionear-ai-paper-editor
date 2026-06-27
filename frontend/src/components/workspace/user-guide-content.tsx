import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import { GuideStepDemo } from "@/components/workspace/guide-step-demos";
import { guideCopy } from "@/lib/guide-i18n";

export function UserGuideContent() {
  const { locale } = useLocale();
  const g = useMemo(() => guideCopy(locale), [locale]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <p className="font-body text-sm leading-relaxed text-muted-foreground md:text-base">{g.lede}</p>

        <ol className="mt-8 space-y-10">
          {g.steps.map((step) => (
            <li key={step.id} className="guide-step">
              <div className="flex items-baseline gap-3">
                <span className="font-mono-data text-xs tracking-widest text-[color:var(--editorial-red)]">
                  {step.step}
                </span>
                <h2 className="font-serif-display text-lg font-bold tracking-tight md:text-xl">{step.title}</h2>
              </div>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              <div className="guide-step-demo mt-4">
                <GuideStepDemo id={step.id} labels={g.demo} />
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 border-t border-foreground/20 pt-8">
          <Link
            to="/projects"
            className="inline-flex min-h-[44px] items-center gap-2 border border-foreground bg-foreground px-5 py-2.5 font-sans-ui text-xs uppercase tracking-widest text-background transition-colors hover:bg-background hover:text-foreground"
          >
            {g.cta} <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </div>
  );
}
