/**
 * Billing API client — subscription status + mock upgrade.
 *
 * V1: upgrade is instant/free (no payment gateway).
 * V2 path: replace upgradeToPro body with Stripe Checkout Session fetch.
 */
import { resolveApiBase } from "./base-url";
import { mapApiHttpError } from "./api-errors";
import { getAccessToken } from "@/lib/auth-store";

const API_BASE = resolveApiBase();

// ─── Types ────────────────────────────────────────────────────────────────

export type UserTier = "free" | "pro";

export type BillingStatus = {
  tier: UserTier;
  defense_turns_limit: number;
  defense_turns_used: number;
  defense_turns_remaining: number;
  upgraded_at: string | null;
  created_at: string;
};

export type UpgradeResult =
  | { ok: true; message: string; billing: BillingStatus }
  | { ok: false; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────

async function billingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch { /* ignore */ }
    throw new Error(mapApiHttpError(res.status, detail));
  }

  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Fetch the current user's subscription status and defense-turn quota. */
export async function fetchBillingStatus(): Promise<BillingStatus> {
  return billingFetch<BillingStatus>("/billing/status");
}

/** Mock-upgrade the authenticated user to Pro (V1 — no real payment). */
export async function upgradeToPro(): Promise<UpgradeResult> {
  try {
    const data = await billingFetch<{ ok: boolean; message: string; billing: BillingStatus }>(
      "/billing/upgrade",
      { method: "POST", body: JSON.stringify({ plan: "pro" }) },
    );
    return { ok: true, message: data.message, billing: data.billing };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upgrade failed." };
  }
}
