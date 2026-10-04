import { BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLocale } from "@/components/locale-context";
import { GuideStepDemo } from "@/components/workspace/guide-step-demos";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { guideCopy } from "@/lib/guide-i18n";
import { markEditorOnboardingSeen } from "@/features/editor/lib/editor-onboarding-prefs";

type EditorOnboardingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditorOnboardingDialog({ open, onOpenChange }: EditorOnboardingDialogProps) {
  const { locale } = useLocale();
  const g = useMemo(() => guideCopy(locale), [locale]);
  const steps = g.editor.steps;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const finish = () => {
    markEditorOnboardingSeen();
    setIndex(0);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      finish();
      return;
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="editor-onboarding-dialog max-h-[min(92dvh,52rem)] max-w-3xl gap-0 overflow-hidden border-2 border-foreground p-0 shadow-[6px_6px_0_0_rgba(0,0,0,0.08)] sm:rounded-none">
        <DialogHeader className="space-y-3 border-b border-foreground/15 px-5 py-5 text-left">
          <div className="flex items-start gap-3">
            <span className="editor-onboarding-icon" aria-hidden>
              <BookOpen className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 space-y-2">
              <p className="font-mono-data text-[10px] uppercase tracking-widest text-[color:var(--editorial-red)]">
                {g.onboarding.stepOf(index + 1, steps.length)}
              </p>
              <DialogTitle className="font-serif-display text-xl font-bold leading-snug tracking-tight">
                {step.title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-foreground/80">
                {step.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="editor-onboarding-body soft-scrollbar overflow-y-auto px-5 py-4">
          {step.bullets?.length ? (
            <ul className="guide-step-bullets mb-4 space-y-1.5 font-body text-sm leading-relaxed text-muted-foreground">
              {step.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          <div className="guide-step-demo">
            <GuideStepDemo id={step.id} labels={g.demo} />
          </div>
        </div>

        <DialogFooter className="editor-onboarding-footer flex-col gap-3 border-t border-foreground/15 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            to="/guide"
            onClick={finish}
            className="font-sans-ui text-[11px] uppercase tracking-widest text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {g.onboarding.fullGuide}
          </Link>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <button
              type="button"
              onClick={finish}
              className="projects-header-btn min-h-[40px] px-4"
            >
              {g.onboarding.skip}
            </button>
            {!isFirst ? (
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="projects-header-btn min-h-[40px] px-4"
              >
                {g.onboarding.prev}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (isLast) finish();
                else setIndex((i) => Math.min(steps.length - 1, i + 1));
              }}
              className="projects-header-btn projects-header-btn-primary min-h-[40px] px-5"
            >
              {isLast ? g.onboarding.done : g.onboarding.next}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
