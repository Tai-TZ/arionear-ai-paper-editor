import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingCards } from "@/components/billing/pricing-cards";
import { type BillingStatus, fetchBillingStatus } from "@/lib/api/billing-api";
import { getAccessToken } from "@/lib/auth-store";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Chọn gói dịch vụ — Arionear" },
      {
        name: "description",
        content:
          "Chọn gói Free hoặc Pro để mở khoá thêm lượt Defense Phản Biện và các tính năng nâng cao.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
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
      {/* Top navigation strip */}
      <header className="sticky top-0 z-10 flex items-center border-b bg-background/80 px-6 py-3 backdrop-blur">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link to="/projects">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Link>
        </Button>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Hero copy */}
        <div className="mb-12 text-center">
          <div className="mb-4 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Gói dịch vụ Arionear
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Chọn gói phù hợp với bạn
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Dùng Ario không giới hạn cho biên tập LaTeX. Nâng cấp Pro để mở khoá thêm lượt
            &nbsp;<strong>Defense Phản Biện</strong>&nbsp;AI và các tính năng cao cấp.
          </p>
        </div>

        {/* Quota skeleton while loading */}
        {loading && (
          <div className="mx-auto mb-8 w-full max-w-md">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        )}

        {/* Pricing cards — pass `undefined` when not logged in so quota bar is hidden */}
        <PricingCards
          billingStatus={isLoggedIn ? billing : undefined}
          onUpgradeSuccess={(updated) => setBilling(updated)}
        />

        {/* Footer note for unauthenticated visitors */}
        {!isLoggedIn && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
              Đăng ký miễn phí
            </Link>
            &nbsp;hoặc&nbsp;
            <Link to="/signin" className="font-medium text-primary underline-offset-4 hover:underline">
              đăng nhập
            </Link>
            &nbsp;để quản lý gói dịch vụ.
          </p>
        )}
      </main>
    </div>
  );
}
