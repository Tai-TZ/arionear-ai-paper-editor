import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchBillingStatus, type BillingStatus } from "@/lib/api/billing-api";

type WorkspaceBillingContextValue = {
  billing: BillingStatus | null;
  tierLoading: boolean;
  billingError: boolean;
  refreshBilling: () => Promise<BillingStatus | null>;
};

const WorkspaceBillingContext = createContext<WorkspaceBillingContextValue | null>(null);

let cachedBilling: BillingStatus | null = null;

/** Keep workspace billing cache in sync after checkout on marketing /pricing. */
export function syncWorkspaceBillingCache(status: BillingStatus) {
  cachedBilling = status;
}

export function WorkspaceBillingProvider({ children }: { children: ReactNode }) {
  const [billing, setBilling] = useState<BillingStatus | null>(cachedBilling);
  const [tierLoading, setTierLoading] = useState(cachedBilling === null);
  const [billingError, setBillingError] = useState(false);

  const refreshBilling = useCallback(async () => {
    setTierLoading(true);
    setBillingError(false);
    try {
      const status = await fetchBillingStatus();
      cachedBilling = status;
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

export function useWorkspaceBilling() {
  const ctx = useContext(WorkspaceBillingContext);
  if (!ctx) {
    throw new Error("useWorkspaceBilling must be used within WorkspaceBillingProvider");
  }
  return ctx;
}
