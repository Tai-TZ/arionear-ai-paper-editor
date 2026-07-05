import type { UiLanguage } from "@/lib/locale-store";

const VI_RESET_TZ = "Asia/Ho_Chi_Minh";

/** Milliseconds until an ISO timestamp, or null when invalid / absent. */
export function msUntilIso(iso: string | null | undefined, nowMs = Date.now()): number | null {
  if (!iso) return null;
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  return Math.max(0, target - nowMs);
}

/** Backend resets defense quota at 23:59:59 Asia/Ho_Chi_Minh for all users. */
export function defenseQuotaResetTimeZone(_locale: UiLanguage): string {
  return VI_RESET_TZ;
}

/** Milliseconds until 23:59:59.999 on the current calendar day in *timeZone*. */
export function msUntilEndOfDay235959(timeZone: string, nowMs = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(nowMs));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const h = get("hour");
  const m = get("minute");
  const s = get("second");
  const msIntoDay = ((h * 3600 + m * 60 + s) * 1000 + (nowMs % 1000));
  const targetMs = ((23 * 3600 + 59 * 60 + 59) * 1000 + 999);
  const remaining = targetMs - msIntoDay;
  return remaining > 0 ? remaining : 0;
}

export function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
