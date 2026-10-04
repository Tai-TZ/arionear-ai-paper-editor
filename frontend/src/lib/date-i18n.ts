import type { UiLanguage } from "@/lib/researcher-profile";

export function localeBcp47(locale: UiLanguage): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}

const TIME_AGO = {
  en: {
    justNow: "Just now",
    minutes: (n: number) => `${n}m ago`,
    hours: (n: number) => `${n}h ago`,
    days: (n: number) => `${n}d ago`,
  },
  vi: {
    justNow: "Vừa xong",
    minutes: (n: number) => `${n} phút trước`,
    hours: (n: number) => `${n} giờ trước`,
    days: (n: number) => `${n} ngày trước`,
  },
} as const;

export function parseApiTimestamp(value: string | number | Date): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  if (!raw) return NaN;
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
  return new Date(normalized).getTime();
}

export function formatTimeAgo(
  timestamp: number | string | Date,
  locale: UiLanguage = "en",
): string {
  const ms = typeof timestamp === "number" ? timestamp : parseApiTimestamp(timestamp);
  if (!Number.isFinite(ms)) return "—";
  const labels = TIME_AGO[locale];
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return labels.justNow;
  if (minutes < 60) return labels.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return labels.hours(hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return labels.days(days);
  return formatProjectDateTime(ms, locale);
}

/** Absolute local date/time for project list columns and cards. */
export function formatProjectDateTime(timestamp: number, locale: UiLanguage = "en"): string {
  if (!Number.isFinite(timestamp)) return "—";
  return new Date(timestamp).toLocaleString(localeBcp47(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Profile timestamps and similar ISO/date values. */
export function formatDateTime(value: string | number | Date, locale: UiLanguage = "en"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(localeBcp47(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
