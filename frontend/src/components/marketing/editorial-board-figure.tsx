import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AboutPageCopy } from "@/lib/marketing-pages-i18n";

const EDITOR_X = [120, 280, 440] as const;
const INITIALS = ["TT", "TN", "NA"] as const;
const AUTO_MS = 3200;

type EditorialBoardFigureProps = {
  copy: AboutPageCopy;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
};

export function EditorialBoardFigure({
  copy,
  activeIndex,
  onActiveIndexChange,
}: EditorialBoardFigureProps) {
  const [autoPlay, setAutoPlay] = useState(true);
  const activeRef = useRef(activeIndex);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    if (!autoPlay) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      onActiveIndexChange((activeRef.current + 1) % EDITOR_X.length);
    }, AUTO_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [activeIndex, autoPlay, onActiveIndexChange]);

  const pauseAutoplay = useCallback(() => {
    setAutoPlay(false);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const selectEditor = useCallback(
    (index: number) => {
      pauseAutoplay();
      onActiveIndexChange(index);
    },
    [onActiveIndexChange, pauseAutoplay],
  );

  return (
    <div className="about-board-figure mt-10 border border-foreground bg-background overflow-hidden">
      <div className="about-board-toolbar flex items-center justify-between gap-3 border-b border-foreground/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`about-board-live-dot ${autoPlay ? "is-live" : ""}`} aria-hidden />
          <span className="font-mono-data text-[10px] uppercase tracking-widest text-neutral-600">
            {autoPlay ? copy.liveDemo : copy.paused}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAutoPlay((v) => !v)}
          className="about-board-play inline-flex items-center gap-1.5 border border-foreground/30 px-2.5 py-1 font-sans-ui text-[10px] uppercase tracking-widest hover:border-foreground"
          aria-pressed={autoPlay}
        >
          {autoPlay ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {autoPlay ? copy.pauseDemo : copy.playDemo}
        </button>
      </div>

      <svg
        viewBox="0 0 640 160"
        className="about-board-svg w-full h-auto"
        role="img"
        aria-label={copy.illustrationAria}
      >
        <rect x="0" y="110" width="640" height="50" fill="var(--foreground)" />
        <line x1="0" y1="110" x2="640" y2="110" stroke="var(--foreground)" strokeWidth="2" />

        <g className="about-board-papers">
          <rect
            x="32"
            y="72"
            width="48"
            height="36"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="1.5"
          />
          <rect
            x="38"
            y="66"
            width="48"
            height="36"
            fill="var(--newsprint, #F9F7F2)"
            stroke="var(--foreground)"
            strokeWidth="1.5"
          />
          <line
            className="about-board-paper-line"
            x1="44"
            y1="78"
            x2="78"
            y2="78"
            stroke="var(--foreground)"
            strokeWidth="1"
            opacity="0.4"
          />
          <line
            className="about-board-paper-line about-board-paper-line--2"
            x1="44"
            y1="86"
            x2="72"
            y2="86"
            stroke="var(--foreground)"
            strokeWidth="1"
            opacity="0.4"
          />
          <line
            className="about-board-paper-line about-board-paper-line--3"
            x1="44"
            y1="94"
            x2="76"
            y2="94"
            stroke="var(--foreground)"
            strokeWidth="1"
            opacity="0.4"
          />
        </g>

        {EDITOR_X.map((x, i) => {
          const active = activeIndex === i;
          return (
            <g
              key={i}
              className={`about-board-editor ${active ? "is-active" : ""}`}
              onClick={() => selectEditor(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectEditor(i);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={copy.editorRoles[i]}
              style={{ cursor: "pointer" }}
            >
              <rect
                className="about-board-chair"
                x={x - 28}
                y="48"
                width="56"
                height="62"
                fill="none"
                stroke="var(--foreground)"
                strokeWidth="1.5"
                rx="2"
              />
              <circle
                className="about-board-head"
                cx={x}
                cy="36"
                r="18"
                fill="var(--newsprint, #F9F7F2)"
                stroke="var(--foreground)"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y="41"
                textAnchor="middle"
                style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", fontWeight: 700 }}
                fill="var(--foreground)"
              >
                {INITIALS[i]}
              </text>
              <path
                className="about-board-body"
                d={`M ${x - 22} 110 L ${x - 16} 72 L ${x + 16} 72 L ${x + 22} 110 Z`}
                fill="var(--newsprint, #F9F7F2)"
                stroke="var(--foreground)"
                strokeWidth="1.5"
              />
              {i === 1 ? (
                <g className={`about-board-lamp ${active ? "is-lit" : ""}`}>
                  <line
                    x1={x}
                    y1="20"
                    x2={x}
                    y2="8"
                    stroke="var(--editorial-red, #c0392b)"
                    strokeWidth="2"
                  />
                  <path
                    d={`M ${x - 14} 20 Q ${x} 32 ${x + 14} 20 Z`}
                    fill="var(--editorial-red, #c0392b)"
                    opacity="0.9"
                  />
                </g>
              ) : null}
              {active ? (
                <rect
                  className="about-board-focus-ring"
                  x={x - 34}
                  y="4"
                  width="68"
                  height="108"
                  fill="none"
                  stroke="var(--editorial-red, #c0392b)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  rx="2"
                />
              ) : null}
            </g>
          );
        })}

        <rect
          className={`about-board-manuscript ${activeIndex === 1 ? "is-active" : ""}`}
          x="248"
          y="88"
          width="144"
          height="20"
          fill="var(--newsprint, #F9F7F2)"
          stroke="var(--foreground)"
          strokeWidth="1.5"
        />
        <text
          className="about-board-manuscript-label"
          x="320"
          y="102"
          textAnchor="middle"
          style={{ fontFamily: "'Playfair Display', serif", fontSize: "11px", fontStyle: "italic" }}
          fill="var(--foreground)"
        >
          {copy.manuscriptLabel}
        </text>

        <rect
          x="480"
          y="24"
          width="128"
          height="52"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="1.5"
        />
        <text
          x="544"
          y="48"
          textAnchor="middle"
          style={{ fontFamily: "'Playfair Display', serif", fontSize: "16px", fontWeight: 900 }}
        >
          <tspan fill="var(--foreground)">Ario</tspan>
          <tspan fill="var(--editorial-red)">near</tspan>
        </text>
        <text
          x="544"
          y="66"
          textAnchor="middle"
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "7px",
            letterSpacing: "0.12em",
          }}
          fill="var(--foreground)"
          opacity="0.6"
        >
          C2 · APP · 040
        </text>
      </svg>

      <div className="flex flex-col gap-1 border-t border-foreground px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-body italic text-sm text-neutral-500">{copy.figCaption}</p>
        <p className="font-mono-data text-[10px] uppercase tracking-widest text-neutral-500">
          {copy.loopHint}
        </p>
      </div>
    </div>
  );
}
