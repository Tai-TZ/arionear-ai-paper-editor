import { resolveApiBase } from "@/lib/api/base-url";

/** API URL that performs checkout confirmation and returns the HTML result page. */
export function buildBillingConfirmApiUrl(checkoutId: string): string {
  const apiBase = resolveApiBase().replace(/\/$/, "");
  return `${apiBase}/billing/confirm/${checkoutId}`;
}
