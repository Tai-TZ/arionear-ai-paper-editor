import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AppLoadingScreenInner } from "@/components/app-loading-screen";
import { LocaleContext, type LocaleContextValue } from "@/components/locale-context";
import { applyLocale, getStoredLocale, type UiLanguage } from "@/lib/locale-store";
import { applyTheme, getStoredTheme } from "@/lib/theme-store";
import { commonCopy } from "@/lib/common-i18n";

type BootstrapPhase = "booting" | "exiting" | "ready";

const BOOTSTRAP_EXIT_MS = 280;

function ShellBootstrapScreen({ exiting, locale }: { exiting: boolean; locale: UiLanguage }) {
  const t = commonCopy(locale).shell;
  return (
    <AppLoadingScreenInner
      locale={locale}
      label={t.loadingRoute}
      eyebrow={t.loadingEyebrow}
      variant="fullscreen"
      exiting={exiting}
    />
  );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<BootstrapPhase>("booting");
  const [locale, setLocaleState] = useState<UiLanguage>("en");

  useEffect(() => {
    const storedLocale = getStoredLocale();
    const storedTheme = getStoredTheme();
    setLocaleState(storedLocale);
    applyLocale(storedLocale);
    applyTheme(storedTheme);
    setPhase("exiting");
    const timer = window.setTimeout(() => setPhase("ready"), BOOTSTRAP_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase === "booting") return;
    applyLocale(locale);
  }, [locale, phase]);

  const ready = phase === "ready";

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next) => setLocaleState(next),
      ready,
    }),
    [locale, ready],
  );

  return (
    <LocaleContext.Provider value={value}>
      {phase !== "booting" ? children : null}
      {phase !== "ready" ? (
        <ShellBootstrapScreen exiting={phase === "exiting"} locale={locale} />
      ) : null}
    </LocaleContext.Provider>
  );
}
