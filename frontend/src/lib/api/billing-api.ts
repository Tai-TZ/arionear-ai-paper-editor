/**
 * Billing API client — subscription status + QR checkout.
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

export type CheckoutResult =
  | { ok: true; checkoutId: string; confirmUrl: string; qrPngB64: string; expiresInMinutes: number }
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

/**
 * Create a QR checkout session. Returns the confirm URL and a base-64 PNG
 * that the client renders as a QR code. The user scans with their phone;
 * the backend upgrades the account and the client polls /billing/status.
 *
 * V2: will return a Stripe Checkout URL instead.
 */
export async function createCheckout(): Promise<CheckoutResult> {
  try {
    const data = await billingFetch<{
      checkout_id: string;
      confirm_url: string;
      qr_png_b64: string;
      expires_in_minutes: number;
    }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({
        client_origin: typeof window !== "undefined" ? window.location.origin : undefined,
      }),
    });
    return {
      ok: true,
      checkoutId: data.checkout_id,
      confirmUrl: data.confirm_url,
      qrPngB64: data.qr_png_b64,
      expiresInMinutes: data.expires_in_minutes,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to create checkout." };
  }
}
