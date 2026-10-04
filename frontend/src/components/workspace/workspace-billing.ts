import { createContext, useContext } from "react";

import type { BillingStatus } from "@/lib/api/billing-api";

export type WorkspaceBillingContextValue = {
  billing: BillingStatus | null;
  tierLoading: boolean;
  billingError: boolean;
  refreshBilling: () => Promise<BillingStatus | null>;
};

export const WorkspaceBillingContext = createContext<WorkspaceBillingContextValue | null>(null);

let cachedBilling: BillingStatus | null = null;

export function getCachedWorkspaceBilling(): BillingStatus | null {
  return cachedBilling;
}

/** Keep workspace billing cache in sync after checkout on marketing /pricing. */
export function syncWorkspaceBillingCache(status: BillingStatus) {
  cachedBilling = status;
}

export function useWorkspaceBilling() {
  const ctx = useContext(WorkspaceBillingContext);
  if (!ctx) {
    throw new Error("useWorkspaceBilling must be used within WorkspaceBillingProvider");
  }
  return ctx;
}
