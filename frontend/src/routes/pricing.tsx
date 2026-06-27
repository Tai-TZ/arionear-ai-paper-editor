import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingCards } from "@/components/billing/pricing-cards";
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
        content:
          "Choose Free or Pro to unlock more Defense Rehearsal turns and advanced features.",
      },
    ],
  }),
  component: PricingPage,
});

const pageCopy = {
  vi: {
    back: "Quay lại",
    badge: "Gói dịch vụ Arionear",
    heading: "Chọn gói phù hợp với bạn",
    lede: (
      <>
        Dùng Ario không giới hạn cho biên tập LaTeX. Nâng cấp Pro để mở khoá thêm lượt
        &nbsp;<strong>Defense Phản Biện</strong>&nbsp;AI và các tính năng cao cấp.
      </>
    ),
    signupLink: "Đăng ký miễn phí",
    loginLink: "đăng nhập",
    authNote: (signup: React.ReactNode, login: React.ReactNode) => (
      <>{signup}&nbsp;hoặc&nbsp;{login}&nbsp;để quản lý gói dịch vụ.</>
    ),
  },
  en: {
    back: "Go back",
    badge: "Arionear Plans",
    heading: "Choose your plan",
    lede: (
      <>
        Use Ario without limits for LaTeX editing. Upgrade to Pro to unlock more&nbsp;
        <strong>Defense Rehearsal</strong>&nbsp;turns and premium features.
      </>
    ),
    signupLink: "Sign up for free",
    loginLink: "sign in",
    authNote: (signup: React.ReactNode, login: React.ReactNode) => (
      <>{signup}&nbsp;or&nbsp;{login}&nbsp;to manage your plan.</>
    ),
  },
};

function PricingPage() {
  const { locale } = useLocale();
  const t = locale === "vi" ? pageCopy.vi : pageCopy.en;
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const isLoggedIn = Boolean(getAccessToken());

  useEffect(() => {
    if (!isLoggedIn) return;
    setLoading(true);
    fetchBillingStatus()
      .then(setBilling)
      .catch(() => {/* silently ignore — cards still render without quota bar */})
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center border-b bg-background/80 px-6 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link to="/projects">
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-12 text-center">
          <div className="mb-4 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {t.badge}
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t.heading}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            {t.lede}
          </p>
        </div>

        {loading && (
          <div className="mx-auto mb-8 w-full max-w-md">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        )}

        <PricingCards
          billingStatus={isLoggedIn ? billing : undefined}
          onUpgradeSuccess={(updated) => setBilling(updated)}
        />

        {!isLoggedIn && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            {t.authNote(
              <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
                {t.signupLink}
              </Link>,
              <Link to="/signin" className="font-medium text-primary underline-offset-4 hover:underline">
                {t.loginLink}
              </Link>,
            )}
          </p>
        )}
      </main>
    </div>
  );
}
