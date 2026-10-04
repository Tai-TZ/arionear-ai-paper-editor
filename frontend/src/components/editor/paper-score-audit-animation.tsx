import { useEffect, useRef, useState } from "react";

function ScanningLines() {
  return (
    <div className="flex flex-col gap-[5px] w-full" aria-hidden>
      {[0.9, 1, 0.7, 0.95, 0.6, 0.85, 0.75, 0.5].map((w, i) => (
        <div
          key={i}
          className="h-[6px] rounded-full bg-foreground/10 overflow-hidden"
          style={{ width: `${w * 100}%` }}
        >
          <div
            className="h-full rounded-full bg-foreground/25"
            style={{
              width: "40%",
              animation: `scan-slide 1.8s ease-in-out infinite`,
              animationDelay: `${i * 0.18}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function BlinkingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1em] bg-current align-middle ml-0.5"
      style={{ animation: "blink 1s step-end infinite" }}
      aria-hidden
    />
  );
}

export function PaperScoreAuditAnimation({
  progress,
  label,
  phrases,
}: {
  progress?: string | null;
  label: string;
  phrases: string[];
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (progress) return;
    const interval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % Math.max(phrases.length, 1));
      setIsTyping(true);
      setDisplayed("");
    }, 4000);
    return () => clearInterval(interval);
  }, [progress, phrases.length]);

  const lastProgressRef = useRef<string | null>(null);
  const fallback = phrases[phraseIndex] ?? "";
  const target = progress ?? fallback;

  useEffect(() => {
    if (progress !== null && progress === lastProgressRef.current) return;
    lastProgressRef.current = progress ?? null;

    setIsTyping(true);
    setDisplayed("");
    let i = 0;
    const tick = () => {
      i++;
      setDisplayed(target.slice(0, i));
      if (i < target.length) {
        typingRef.current = setTimeout(tick, 28 + Math.random() * 22);
      } else {
        setIsTyping(false);
      }
    };
    typingRef.current = setTimeout(tick, 60);
    return () => {
      if (typingRef.current) clearTimeout(typingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <div className="flex flex-col items-center gap-5 select-none">
      <div className="relative flex h-20 w-16 items-end justify-center">
        <div className="relative w-full h-[4.5rem] rounded-sm border-2 border-foreground/20 bg-background shadow-sm overflow-hidden">
          <div
            className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/70 to-transparent"
            style={{ animation: "scan-beam 2s ease-in-out infinite" }}
            aria-hidden
          />
          <div className="pt-2 px-1.5 flex flex-col gap-[4px]">
            {[0.85, 1, 0.65, 0.9, 0.7, 0.8, 0.55].map((w, i) => (
              <div
                key={i}
                className="h-[3px] rounded-full"
                style={{
                  width: `${w * 100}%`,
                  backgroundColor: `hsl(var(--foreground) / ${0.08 + (i % 2) * 0.06})`,
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground shadow"
          aria-hidden
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <ellipse cx="5" cy="5" rx="4" ry="2.5" stroke="currentColor" strokeWidth="1.2" />
            <circle
              cx="5"
              cy="5"
              r="1.5"
              fill="currentColor"
              style={{ animation: "pupil-blink 3s ease-in-out infinite" }}
            />
          </svg>
        </div>
      </div>

      <ScanningLines />

      <div className="text-center">
        <p className="font-sans-ui text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1.5">
          {label}
        </p>
        <p className="text-sm text-foreground/80 min-h-[1.5em] leading-snug">
          {displayed}
          {isTyping && <BlinkingCursor />}
        </p>
      </div>

      <style>{`
        @keyframes scan-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes scan-beam {
          0%   { top: 0%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes pupil-blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95%            { transform: scaleY(0.1); }
        }
      `}</style>
    </div>
  );
}
