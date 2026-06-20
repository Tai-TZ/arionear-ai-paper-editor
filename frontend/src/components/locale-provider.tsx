import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { applyLocale, getStoredLocale, type UiLanguage } from "@/lib/locale-store";

type LocaleContextValue = {
  locale: UiLanguage;
  setLocale: (locale: UiLanguage) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLanguage>("en");

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (next) => setLocaleState(next),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
