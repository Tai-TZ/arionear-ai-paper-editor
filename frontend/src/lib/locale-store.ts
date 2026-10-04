import type { UiLanguage } from "@/lib/researcher-profile";

export type { UiLanguage };

const STORAGE_KEY = "arionear-locale";

export function getStoredLocale(): UiLanguage {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem(STORAGE_KEY) === "vi" ? "vi" : "en";
}

export function applyLocale(locale: UiLanguage) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "vi" ? "vi" : "en";
  localStorage.setItem(STORAGE_KEY, locale);
}
