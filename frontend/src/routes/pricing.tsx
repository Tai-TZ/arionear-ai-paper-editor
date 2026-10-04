import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PricingCards } from "@/components/billing/pricing-cards";
import { syncWorkspaceBillingCache } from "@/components/workspace/workspace-context";
import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { type BillingStatus, fetchBillingStatus } from "@/lib/api/billing-api";
import { getAccessToken } from "@/lib/auth-store";
import { useLocale } from "@/components/locale-provider";
import { marketingCopy } from "@/lib/marketing-i18n";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Arionear" },
      {
        name: "description",
        content: "Choose Free or Pro to unlock more Defense Rehearsal turns and advanced features.",
      },
    ],
  }),
  component: PricingPage,
});

const pageCopy = {
  vi: {
    lede: (
      <>
        Dùng Ario không giới hạn cho biên tập LaTeX. Nâng cấp Pro để mở khoá thêm &nbsp;
        <strong>lượt phản biện</strong>&nbsp;AI và các tính năng cao cấp.
      </>
    ),
    signupLink: "Đăng ký miễn phí",
    loginLink: "đăng nhập",
    authNote: (signup: React.ReactNode, login: React.ReactNode) => (
      <>
        {signup}&nbsp;hoặc&nbsp;{login}&nbsp;để quản lý gói dịch vụ.
      </>
    ),
  },
  en: {
    lede: (
      <>
        Use Ario without limits for LaTeX editing. Upgrade to Pro to unlock more&nbsp;
        <strong>Defense Rehearsal</strong>&nbsp;turns and premium features.
      </>
    ),
    signupLink: "Sign up for free",
    loginLink: "sign in",
    authNote: (signup: React.ReactNode, login: React.ReactNode) => (
      <>
        {signup}&nbsp;or&nbsp;{login}&nbsp;to manage your plan.
      </>
    ),
  },
};

function PricingPage() {
  const { locale } = useLocale();
  const t = locale === "vi" ? pageCopy.vi : pageCopy.en;
  const plans = useMemo(() => marketingCopy(locale).plans, [locale]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [billingLoadFailed, setBillingLoadFailed] = useState(false);
  const isLoggedIn = Boolean(getAccessToken());

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    setBillingLoadFailed(false);
    fetchBillingStatus()
      .then(setBilling)
      .catch(() => setBillingLoadFailed(true))
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  return (
    <MarketingLayout>
      <article className="border-b-4 border-foreground newsprint-texture">
        <div className="max-w-4xl mx-auto px-4 py-16 lg:py-24">
          <header className="text-center">
            <h1 className="marketing-page-title font-serif-display font-black text-4xl sm:text-5xl lg:text-[3.5rem] tracking-tighter leading-[0.95]">
              {plans.sectionTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-xl font-body text-lg leading-relaxed text-muted-foreground">
              {t.lede}
            </p>
          </header>

          <div className="mt-14 lg:mt-16">
            <PricingCards
              billingStatus={isLoggedIn ? billing : undefined}
              billingLoading={isLoggedIn && loading}
              billingError={isLoggedIn && billingLoadFailed}
              onUpgradeSuccess={(updated) => {
                syncWorkspaceBillingCache(updated);
                setBillingLoadFailed(false);
                setBilling(updated);
              }}
            />

            {!isLoggedIn && (
              <p className="mt-12 text-center font-body text-sm text-muted-foreground">
                {t.authNote(
                  <Link
                    to="/signup"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
                  >
                    {t.signupLink}
                  </Link>,
                  <Link
                    to="/signin"
                    className="font-medium text-foreground underline underline-offset-4 hover:text-[color:var(--editorial-red)]"
                  >
                    {t.loginLink}
                  </Link>,
                )}
              </p>
            )}
          </div>
        </div>
      </article>
    </MarketingLayout>
  );
}
