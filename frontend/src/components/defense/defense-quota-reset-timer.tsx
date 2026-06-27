import { useEffect, useRef, useState } from "react";
import type { UiLanguage } from "@/lib/locale-store";
import {
  defenseQuotaResetTimeZone,
  formatCountdownMs,
  msUntilEndOfDay235959,
} from "@/lib/defense-quota-reset";

type Props = {
  locale: UiLanguage;
  resetTimeLabel: string;
  countdownLabel: (remaining: string) => string;
  onElapsed?: () => void;
  className?: string;
};

export function DefenseQuotaResetTimer({
  locale,
  resetTimeLabel,
  countdownLabel,
  onElapsed,
  className,
}: Props) {
  const timeZone = defenseQuotaResetTimeZone(locale);
  const [remainingMs, setRemainingMs] = useState(() => msUntilEndOfDay235959(timeZone));
  const elapsedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const next = msUntilEndOfDay235959(timeZone);
      setRemainingMs(next);
      if (next <= 0) {
        if (!elapsedRef.current) {
          elapsedRef.current = true;
          onElapsed?.();
        }
      } else {
        elapsedRef.current = false;
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timeZone, onElapsed]);

  const countdown = formatCountdownMs(remainingMs);

  return (
    <div className={`defense-quota-reset-timer${className ? ` ${className}` : ""}`} role="timer" aria-live="polite">
      <p className="defense-quota-reset-at font-mono-data">
        {resetTimeLabel}
      </p>
      <p className="defense-quota-reset-countdown font-mono-data">{countdownLabel(countdown)}</p>
    </div>
  );
}
