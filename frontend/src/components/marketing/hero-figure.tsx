import { Check, FileText, MessageSquare, PenLine, X } from "lucide-react";

/** Fig. 1.1 — editorial desk mock: AI suggests; author approves. */
export function HeroPeerReviewFigure() {
  return (
    <div
      className="border border-foreground bg-background flex flex-col min-h-[320px]"
      role="img"
      aria-label="Editorial desk mockup: Ario suggests tracked changes on a LaTeX proof while the author retains final approval"
    >
      {/* masthead strip */}
      <div className="flex items-center justify-between border-b border-foreground px-3 py-2 font-mono-data text-[9px] uppercase tracking-widest">
        <span>Desk Session</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 bg-[color:var(--editorial-red)]" aria-hidden />
          Live
        </span>
      </div>

      {/* split panel */}
      <div className="grid grid-cols-2 flex-1 border-b border-foreground">
        {/* Ario — suggestions */}
        <div className="border-r border-foreground p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 pb-2 border-b border-foreground/20">
            <div className="h-8 w-8 border border-foreground flex items-center justify-center shrink-0">
              <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-mono-data text-[9px] uppercase tracking-widest">Ario</p>
              <p className="font-body text-[10px] text-neutral-600 italic">AI editor</p>
            </div>
          </div>

          <div className="space-y-2 flex-1">
            <SuggestionChip label="Style" text="Strengthen the topic sentence." />
            <SuggestionChip label="Citation" text="Verify APA format for [3]." active />
          </div>
        </div>

        {/* Manuscript proof */}
        <div className="p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 pb-2 border-b border-foreground/20">
            <div className="h-8 w-8 border border-foreground flex items-center justify-center shrink-0">
              <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-mono-data text-[9px] uppercase tracking-widest">Proof</p>
              <p className="font-body text-[10px] text-neutral-600 italic">main.tex</p>
            </div>
          </div>

          <div className="border border-foreground/30 p-2.5 flex-1 font-mono text-[9px] leading-[1.65] bg-neutral-50/80 dark:bg-neutral-900/20">
            <p className="text-neutral-500">\section{"{Introduction}"}</p>
            <p className="mt-1.5">
              <span className="line-through decoration-[color:var(--editorial-red)] decoration-1 text-neutral-400">
                This paper discuss
              </span>{" "}
              <span className="bg-[color:var(--editorial-red)]/12 text-[color:var(--editorial-red)] px-0.5">
                This paper discusses
              </span>
            </p>
            <p className="mt-1.5 text-neutral-600">the role of LaTeX in academic publishing.</p>
            <p className="mt-2 text-neutral-500">\cite{"{author2024}"}</p>
          </div>
        </div>
      </div>

      {/* author gate */}
      <div className="bg-foreground text-background px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PenLine className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <p className="font-serif-display italic text-sm truncate">Author retains the pen</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="inline-flex items-center gap-1 border border-background/50 px-2 py-1 font-mono-data text-[8px] uppercase tracking-wider">
              <Check className="h-2.5 w-2.5" strokeWidth={2} /> Accept
            </span>
            <span className="inline-flex items-center gap-1 border border-background/30 px-2 py-1 font-mono-data text-[8px] uppercase tracking-wider opacity-50">
              <X className="h-2.5 w-2.5" strokeWidth={2} /> Refuse
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestionChip({ label, text, active = false }: { label: string; text: string; active?: boolean }) {
  return (
    <div
      className={`border px-2 py-1.5 ${
        active
          ? "border-[color:var(--editorial-red)] bg-[color:var(--editorial-red)]/5"
          : "border-foreground/25"
      }`}
    >
      <p
        className={`font-mono-data text-[8px] uppercase tracking-widest ${
          active ? "text-[color:var(--editorial-red)]" : "text-neutral-500"
        }`}
      >
        {label}
      </p>
      <p className="font-body text-[10px] leading-snug mt-0.5 text-foreground/80">{text}</p>
    </div>
  );
}
