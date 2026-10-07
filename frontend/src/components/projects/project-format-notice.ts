import { useCallback, useRef, useState } from "react";

const NOTICE_KEY = "edico-project-format-notice-ack";

export function hasAcknowledgedProjectFormatNotice(): boolean {
  if (typeof window === "undefined") return true;
  return sessionStorage.getItem(NOTICE_KEY) === "1";
}

function acknowledgeProjectFormatNotice(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(NOTICE_KEY, "1");
}

export function useProjectFormatNotice() {
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  const runWithNotice = useCallback((action?: () => void) => {
    if (hasAcknowledgedProjectFormatNotice()) {
      action?.();
      return;
    }
    pendingRef.current = action ?? null;
    setOpen(true);
  }, []);

  const confirm = useCallback(() => {
    acknowledgeProjectFormatNotice();
    setOpen(false);
    const next = pendingRef.current;
    pendingRef.current = null;
    next?.();
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    pendingRef.current = null;
  }, []);

  return { open, setOpen, runWithNotice, confirm, dismiss };
}
