import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, MessageSquare, Pause, PenLine, Play, X } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { marketingCopy, type HeroSuggestionCopy } from "@/lib/marketing-i18n";

type SuggestionId = "style" | "citation" | "logic";
type ResolveState = "pending" | "accepted" | "refused";

type Suggestion = HeroSuggestionCopy;

const AUTO_STEP_MS = 4000;
const LOOP_PAUSE_MS = 900;
const INITIAL_RESOLVED: Record<SuggestionId, ResolveState> = {
  style: "pending",
  citation: "pending",
  logic: "pending",
};

function nextPendingId(
  resolved: Record<SuggestionId, ResolveState>,
  suggestions: Suggestion[],
): SuggestionId | null {
  for (const s of suggestions) {
    if (resolved[s.id] === "pending") return s.id;
  }
  return null;
}

/** Fig. 1.1 — interactive editorial desk demo (mock only, no API). */
export function HeroPeerReviewFigure() {
  const { locale } = useLocale();
  const demo = useMemo(() => marketingCopy(locale).heroDemo, [locale]);
  const suggestions = demo.suggestions;

  const [resolved, setResolved] = useState(INITIAL_RESOLVED);
  const [activeId, setActiveId] = useState<SuggestionId>("style");
  const [status, setStatus] = useState(() => suggestions[0]!.statusHint);
  const [autoPlay, setAutoPlay] = useState(true);
  const [stepKey, setStepKey] = useState(0);
  const [loopKey, setLoopKey] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [flashAccept, setFlashAccept] = useState(false);
  const [flashRefuse, setFlashRefuse] = useState(false);
  const [loopFade, setLoopFade] = useState(false);
  const userInteractedRef = useRef(false);
  const autoPlayRef = useRef(autoPlay);
  const resolvedRef = useRef(resolved);
  const activeIdRef = useRef(activeId);
  const stepTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setResolved(INITIAL_RESOLVED);
    setActiveId("style");
    setStatus(suggestions[0]!.statusHint);
    setThinking(false);
    setFlashAccept(false);
    setFlashRefuse(false);
    setLoopKey((k) => k + 1);
    userInteractedRef.current = false;
    setAutoPlay(true);
  }, [locale, suggestions]);

  useEffect(() => {
    resolvedRef.current = resolved;
  }, [resolved]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
  }, [autoPlay]);

  const styleAccepted = resolved.style === "accepted";
  const citationAccepted = resolved.citation === "accepted";
  const citationActive = activeId === "citation" && resolved.citation === "pending";
  const logicVisible = activeId === "logic" && resolved.logic === "pending";
  const allDone = suggestions.every((s) => resolved[s.id] !== "pending");

  const softReset = useCallback(() => {
    setLoopFade(true);
    window.setTimeout(() => {
      setResolved(INITIAL_RESOLVED);
      setActiveId("style");
      setStatus(suggestions[0]!.statusHint);
      setThinking(false);
      setFlashAccept(false);
      setFlashRefuse(false);
      setStepKey((k) => k + 1);
      setLoopKey((k) => k + 1);
      setLoopFade(false);
    }, 320);
  }, [suggestions]);

  const resetDemo = useCallback(() => {
    userInteractedRef.current = false;
    setAutoPlay(true);
    softReset();
  }, [softReset]);

  const pauseAutoplay = useCallback(() => {
    userInteractedRef.current = true;
    setAutoPlay(false);
    if (stepTimerRef.current) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const goToSuggestion = useCallback(
    (id: SuggestionId) => {
      setActiveId(id);
      const item = suggestions.find((s) => s.id === id);
      if (item) setStatus(item.statusHint);
      setStepKey((k) => k + 1);
    },
    [suggestions],
  );

  const selectSuggestion = useCallback(
    (id: SuggestionId) => {
      if (resolvedRef.current[id] !== "pending") return;
      pauseAutoplay();
      goToSuggestion(id);
    },
    [goToSuggestion, pauseAutoplay],
  );

  const resolveActive = useCallback(
    (action: "accepted" | "refused") => {
      const current = activeIdRef.current;
      if (resolvedRef.current[current] !== "pending") return;
      pauseAutoplay();

      const item = suggestions.find((s) => s.id === current)!;
      const nextResolved = { ...resolvedRef.current, [current]: action };
      setResolved(nextResolved);
      setStatus(action === "accepted" ? item.acceptHint : item.refuseHint);
      setStepKey((k) => k + 1);

      if (action === "accepted") {
        setFlashAccept(true);
        window.setTimeout(() => setFlashAccept(false), 650);
      } else {
        setFlashRefuse(true);
        window.setTimeout(() => setFlashRefuse(false), 450);
      }

      const next = nextPendingId(nextResolved, suggestions);
      if (next) window.setTimeout(() => goToSuggestion(next), 700);
    },
    [goToSuggestion, pauseAutoplay, suggestions],
  );

  const scheduleStep = useCallback(
    (delayMs: number) => {
      if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = window.setTimeout(() => {
        stepTimerRef.current = null;
        if (!autoPlayRef.current) return;

        const currentResolved = resolvedRef.current;
        const currentActive = activeIdRef.current;
        const pending = nextPendingId(currentResolved, suggestions);

        if (!pending) {
          setStatus(demo.sessionComplete);
          stepTimerRef.current = window.setTimeout(() => {
            if (!autoPlayRef.current) return;
            softReset();
          }, LOOP_PAUSE_MS);
          return;
        }

        setThinking(true);
        window.setTimeout(() => setThinking(false), 520);

        if (currentResolved[currentActive] === "pending" && currentActive === pending) {
          const item = suggestions.find((s) => s.id === currentActive)!;
          const nextResolved = { ...currentResolved, [currentActive]: "accepted" as const };
          setResolved(nextResolved);
          setStatus(item.acceptHint);
          setFlashAccept(true);
          setStepKey((k) => k + 1);
          window.setTimeout(() => setFlashAccept(false), 650);

          const next = nextPendingId(nextResolved, suggestions);
          if (next) {
            window.setTimeout(() => goToSuggestion(next), 680);
          }
        } else {
          goToSuggestion(pending);
        }

        scheduleStep(AUTO_STEP_MS);
      }, delayMs);
    },
    [goToSuggestion, softReset, suggestions, demo.sessionComplete],
  );

  useEffect(() => {
    if (!autoPlay) {
      if (stepTimerRef.current) {
        window.clearTimeout(stepTimerRef.current);
        stepTimerRef.current = null;
      }
      return;
    }
    scheduleStep(AUTO_STEP_MS);
    return () => {
      if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
    };
  }, [autoPlay, loopKey, scheduleStep]);

  const togglePlay = () => {
    if (autoPlay) {
      pauseAutoplay();
    } else {
      userInteractedRef.current = false;
      setAutoPlay(true);
      setStepKey((k) => k + 1);
    }
  };

  return (
    <div
      className={`hero-demo border border-foreground flex flex-col min-h-[400px] lg:min-h-[460px] xl:min-h-[500px]${flashAccept ? " hero-demo-flash-accept" : ""}${flashRefuse ? " hero-demo-flash-refuse" : ""}${loopFade ? " hero-demo-loop-fade" : ""}${autoPlay ? " hero-demo-autoplay" : ""}`}
      role="application"
      aria-label={demo.ariaLabel}
      onMouseEnter={() => {
        if (!userInteractedRef.current) setAutoPlay(false);
      }}
      onMouseLeave={() => {
        if (!userInteractedRef.current) setAutoPlay(true);
      }}
    >
      <div className="hero-demo-chrome flex items-center justify-between border-b border-foreground px-4 py-2.5 font-mono-data text-[11px] uppercase tracking-widest">
        <span>{demo.deskSession}</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="hero-demo-live inline-block h-1.5 w-1.5 bg-[color:var(--editorial-red)]" aria-hidden />
            {autoPlay ? demo.liveDemo : demo.pausedInteractive}
          </span>
          <button
            type="button"
            onClick={togglePlay}
            className="hero-demo-play-btn inline-flex items-center justify-center border border-foreground/30 h-7 w-7 hover:bg-foreground hover:text-background transition-colors"
            aria-label={autoPlay ? demo.pauseDemo : demo.playDemo}
            title={autoPlay ? demo.pause : demo.play}
          >
            {autoPlay ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
        </span>
      </div>

      <div className="grid grid-cols-2 flex-1 border-b border-foreground min-h-[280px] lg:min-h-[320px]">
        <div className="border-r border-foreground p-4 flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-foreground/20">
            <div className="h-10 w-10 border border-foreground flex items-center justify-center shrink-0">
              <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="font-mono-data text-[11px] uppercase tracking-widest">{demo.arioRole}</p>
              <p className="font-body text-xs text-neutral-600 italic">{demo.aiEditor}</p>
            </div>
            {thinking && (
              <span className="ml-auto hero-demo-thinking font-mono-data text-[10px] text-[color:var(--editorial-red)] shrink-0">
                {demo.thinking}
              </span>
            )}
          </div>

          <div className="space-y-2 flex-1">
            {suggestions.map((s) => (
              <SuggestionChip
                key={s.id}
                suggestion={s}
                active={activeId === s.id}
                resolved={resolved[s.id]}
                onSelect={() => selectSuggestion(s.id)}
              />
            ))}
          </div>
        </div>

        <div className="p-4 flex flex-col gap-2.5 min-w-0">
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-foreground/20">
            <div className="h-10 w-10 border border-foreground flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="font-mono-data text-[11px] uppercase tracking-widest">{demo.proof}</p>
              <p className="font-body text-xs text-neutral-600 italic truncate">main.tex</p>
            </div>
          </div>

          <div
            className={`hero-demo-proof border border-foreground/30 p-3 flex-1 font-mono text-xs leading-[1.7] relative overflow-hidden min-h-[140px]${thinking ? " hero-demo-proof-thinking" : ""}`}
            onClick={pauseAutoplay}
          >
            <p className="text-neutral-500">\section{"{Introduction}"}</p>
            <p className="mt-1.5 hero-demo-sentence">
              <span
                className={`hero-demo-del line-through decoration-[color:var(--editorial-red)] decoration-1 text-neutral-400${styleAccepted ? " hero-demo-layer-out" : ""}`}
              >
                This paper discuss
              </span>
              <span
                className={`hero-demo-ins bg-[color:var(--editorial-red)]/12 text-[color:var(--editorial-red)] px-0.5${styleAccepted ? " hero-demo-layer-out" : ""}`}
              >
                {" "}This paper discusses
              </span>
              <span className={`hero-demo-settled${styleAccepted ? " hero-demo-layer-in" : ""}`}>
                This paper discusses
              </span>
              {activeId === "style" && resolved.style === "pending" && (
                <span className="hero-demo-cursor" aria-hidden />
              )}
            </p>
            <p className="mt-1.5 text-neutral-600">the role of LaTeX in academic publishing.</p>
            <p
              className={`mt-2 hero-demo-cite transition-colors duration-500${citationActive ? " text-[color:var(--editorial-red)] hero-demo-cite-warn" : " text-neutral-500"}`}
            >
              {citationAccepted ? (
                "\\cite{author2024}"
              ) : citationActive ? (
                <>\\cite{"{author2024}"} ← verify</>
              ) : (
                <>\\cite{"{author2024}"}</>
              )}
            </p>
            <p
              className={`mt-2 text-[color:var(--editorial-red)]/80 hero-demo-logic-flag${logicVisible ? " hero-demo-layer-in" : " hero-demo-layer-out"}`}
            >
              % ⚠ Methods → missing Figure 1 ref
            </p>
          </div>
        </div>
      </div>

      <div className="bg-foreground text-background px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <PenLine className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <p className="font-serif-display italic text-sm lg:text-base truncate hero-demo-status">{status}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={resolved[activeId] !== "pending"}
              onClick={() => resolveActive("accepted")}
              className="hero-demo-action hero-demo-action-accept inline-flex items-center gap-1.5 border px-2.5 py-1.5 font-mono-data text-[10px] uppercase tracking-wider transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="h-3 w-3" strokeWidth={2} /> {demo.accept}
            </button>
            <button
              type="button"
              disabled={resolved[activeId] !== "pending"}
              onClick={() => resolveActive("refused")}
              className="hero-demo-action hero-demo-action-refuse inline-flex items-center gap-1.5 border border-background/30 px-2.5 py-1.5 font-mono-data text-[10px] uppercase tracking-wider transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="h-3 w-3" strokeWidth={2} /> {demo.refuse}
            </button>
          </div>
        </div>
      </div>

      <div className="hero-demo-footer border-t border-foreground/20 px-4 py-2.5 space-y-2">
        <div className="hero-demo-progress-track h-0.5 bg-foreground/10 overflow-hidden rounded-full" role="presentation">
          <div
            key={`${stepKey}-${loopKey}`}
            className={`hero-demo-progress-fill h-full bg-[color:var(--editorial-red)] rounded-full${autoPlay ? " hero-demo-progress-animate" : ""}`}
            style={autoPlay ? undefined : { width: allDone ? "100%" : `${((suggestions.findIndex((s) => s.id === activeId) + 1) / suggestions.length) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {suggestions.map((s) => (
              <span
                key={s.id}
                className={`hero-demo-dot h-1.5 rounded-full transition-all duration-500 ease-out ${
                  activeId === s.id
                    ? "w-5 bg-[color:var(--editorial-red)]"
                    : resolved[s.id] !== "pending"
                      ? "w-1.5 bg-foreground/50"
                      : "w-1.5 bg-foreground/20"
                }`}
                aria-hidden
              />
            ))}
          </div>
          <p className="font-mono-data text-[10px] uppercase tracking-widest text-neutral-500">
            {autoPlay ? (
              demo.loopHint
            ) : (
              <button
                type="button"
                onClick={resetDemo}
                className="hover:text-[color:var(--editorial-red)] underline-offset-2 hover:underline"
              >
                {demo.replayDemo}
              </button>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function SuggestionChip({
  suggestion,
  active,
  resolved,
  onSelect,
}: {
  suggestion: Suggestion;
  active: boolean;
  resolved: ResolveState;
  onSelect: () => void;
}) {
  const isPending = resolved === "pending";

  return (
    <button
      type="button"
      disabled={!isPending}
      onClick={onSelect}
      className={`hero-demo-chip w-full text-left border px-2.5 py-2 transition-all duration-500 ease-out ${
        !isPending
          ? resolved === "accepted"
            ? "hero-demo-chip-accepted border-foreground/20 opacity-55"
            : "hero-demo-chip-refused border-foreground/15 opacity-40"
          : active
            ? "hero-demo-chip-active border-[color:var(--editorial-red)] bg-[color:var(--editorial-red)]/5 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--editorial-red)_25%,transparent)]"
            : "border-foreground/30 hover:border-foreground/50"
      }`}
      aria-pressed={active}
    >
      <p
        className={`font-mono-data text-[10px] uppercase tracking-widest transition-colors duration-300 ${
          active && isPending ? "text-[color:var(--editorial-red)]" : "text-muted-foreground"
        }`}
      >
        {suggestion.label}
        {resolved === "accepted" && " · ✓"}
        {resolved === "refused" && " · ✕"}
      </p>
      <p className="font-body text-xs leading-snug mt-1 text-foreground/90">{suggestion.text}</p>
    </button>
  );
}
