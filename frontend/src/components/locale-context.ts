import { createContext, useContext } from "react";

import type { UiLanguage } from "@/lib/locale-store";

export type LocaleContextValue = {
  locale: UiLanguage;
  setLocale: (locale: UiLanguage) => void;
  ready: boolean;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
