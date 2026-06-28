export type SmoothStreamController = {
  push: (delta: string) => void;
  flush: () => void;
  reset: () => void;
  dispose: () => void;
};

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
    const backlog = target.length - displayed.length;
    const step = backlog > 160 ? 5 : backlog > 60 ? 3 : backlog > 16 ? 2 : 1;
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
