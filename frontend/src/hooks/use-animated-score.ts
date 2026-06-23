import { useEffect, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function useAnimatedNumber(
  target: number,
  options: { enabled?: boolean; duration?: number; delay?: number } = {},
): number {
  const { enabled = true, duration = 900, delay = 0 } = options;
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setValue(0);
      return;
    }

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setValue(target);
      return;
    }

    setValue(0);
    let frame = 0;
    let start: number | null = null;

    const timeout = window.setTimeout(() => {
      const tick = (ts: number) => {
        if (start === null) start = ts;
        const progress = Math.min(1, (ts - start) / duration);
        setValue(Math.round(target * easeOutCubic(progress)));
        if (progress < 1) {
          frame = window.requestAnimationFrame(tick);
        }
      };
      frame = window.requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
    };
  }, [target, enabled, duration, delay]);

  return value;
}
