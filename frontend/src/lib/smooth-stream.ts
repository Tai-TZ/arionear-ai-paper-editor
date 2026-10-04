export type SmoothStreamController = {
  push: (delta: string) => void;
  flush: () => void;
  reset: () => void;
  dispose: () => void;
};

/** Frames a large backlog is spread over (~0.5 s at 60 fps), so the reveal keeps up with the network. */
const CATCH_UP_FRAMES = 32;

/**
 * Characters to reveal in one animation frame for a given backlog. Short backlogs keep the gentle
 * 1–5 chars/frame typewriter feel; beyond that the step grows with the backlog, so a fast stream
 * trails the network by about half a second instead of being capped at ~300 chars/s.
 */
export function revealStep(backlog: number): number {
  if (backlog > 160) return Math.max(5, Math.ceil(backlog / CATCH_UP_FRAMES));
  if (backlog > 60) return 3;
  if (backlog > 16) return 2;
  return 1;
}

/** Reveal streamed LLM text gradually for a typewriter effect. */
export function createSmoothStream(onDisplay: (text: string) => void): SmoothStreamController {
  let target = "";
  let displayed = "";
  let rafId = 0;

  const tick = () => {
    if (displayed.length >= target.length) {
      rafId = 0;
      return;
    }
    const step = revealStep(target.length - displayed.length);
    displayed = target.slice(0, displayed.length + step);
    onDisplay(displayed);
    rafId = requestAnimationFrame(tick);
  };

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  return {
    push(delta: string) {
      if (!delta) return;
      target += delta;
      schedule();
    },
    flush() {
      if (rafId) cancelAnimationFrame(rafId);
      displayed = target;
      onDisplay(displayed);
      rafId = 0;
    },
    reset() {
      if (rafId) cancelAnimationFrame(rafId);
      target = "";
      displayed = "";
      rafId = 0;
    },
    dispose() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    },
  };
}
