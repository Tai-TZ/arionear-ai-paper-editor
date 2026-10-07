import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PricingCards } from "@/components/billing/pricing-cards";
import {
  syncWorkspaceBillingCache,
  useWorkspaceBilling,
} from "@/components/workspace/workspace-billing";
import { useLocale } from "@/components/locale-context";
import { marketingCopy } from "@/lib/marketing-i18n";

export const Route = createFileRoute("/_workspace/plan")({
  head: () => ({
    meta: [
      { title: "Plan — Edico" },
      { name: "description", content: "Manage your Edico subscription plan." },
    ],
  }),
  component: WorkspacePlanPage,
});

const pageCopy = {
  vi: {
    lede: (
      <>
        Dùng Dico không giới hạn cho biên tập LaTeX. Nâng cấp Pro để mở khoá thêm &nbsp;
        <strong>lượt phản biện</strong>&nbsp;AI và các tính năng cao cấp.
      </>
    ),
  },
  en: {
    lede: (
      <>
        Use Dico without limits for LaTeX editing. Upgrade to Pro to unlock more&nbsp;
        <strong>Defense Rehearsal</strong>&nbsp;turns and premium features.
      </>
    ),
  },
};

function WorkspacePlanPage() {
  const { locale } = useLocale();
  const t = locale === "vi" ? pageCopy.vi : pageCopy.en;
  const plans = useMemo(() => marketingCopy(locale).plans, [locale]);
  const { billing, tierLoading, billingError, refreshBilling } = useWorkspaceBilling();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="workspace-main-header flex shrink-0 items-center border-b border-foreground bg-background px-4 md:px-8">
        <h1 className="truncate font-serif-display text-lg font-bold tracking-tight md:text-xl">
          {plans.sectionTitle}
        </h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-10">
          <p className="mx-auto mb-8 max-w-xl text-center font-body text-sm leading-relaxed text-muted-foreground md:text-base">
            {t.lede}
          </p>
          <PricingCards
            billingStatus={billing ?? undefined}
            billingLoading={tierLoading && !billing}
            billingError={billingError && !billing}
            onUpgradeSuccess={(updated) => {
              syncWorkspaceBillingCache(updated);
              void refreshBilling();
            }}
          />
        </div>
      </div>
    </main>
  );
}
