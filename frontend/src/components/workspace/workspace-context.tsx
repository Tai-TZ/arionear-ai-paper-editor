import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getCachedWorkspaceBilling,
  syncWorkspaceBillingCache,
  WorkspaceBillingContext,
} from "@/components/workspace/workspace-billing";
import { fetchBillingStatus, type BillingStatus } from "@/lib/api/billing-api";

export function WorkspaceBillingProvider({ children }: { children: ReactNode }) {
  const [billing, setBilling] = useState<BillingStatus | null>(getCachedWorkspaceBilling);
  const [tierLoading, setTierLoading] = useState(() => getCachedWorkspaceBilling() === null);
  const [billingError, setBillingError] = useState(false);

  const refreshBilling = useCallback(async () => {
    setTierLoading(true);
    setBillingError(false);
    try {
      const status = await fetchBillingStatus();
      syncWorkspaceBillingCache(status);
      setBilling(status);
      return status;
    } catch {
      setBillingError(true);
      return null;
    } finally {
      setTierLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);

  const value = useMemo(
    () => ({ billing, tierLoading, billingError, refreshBilling }),
    [billing, tierLoading, billingError, refreshBilling],
  );

  return (
    <WorkspaceBillingContext.Provider value={value}>{children}</WorkspaceBillingContext.Provider>
  );
}
