import { useMemo, useState } from "react";
import { Check, Zap, BookOpen, Shield, Loader2, Crown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/locale-provider";
import { marketingCopy } from "@/lib/marketing-i18n";
import type { UiLanguage } from "@/lib/researcher-profile";
import { type BillingStatus, type UserTier, upgradeToPro } from "@/lib/api/billing-api";

// ─── Plan definitions ────────────────────────────────────────────────────

type PlanFeature = { text: string; included: boolean };

type PlanConfig = {
  tier: UserTier;
  name: string;
  price: string;
  priceSub: string;
  tagline: string;
  cta: string;
  highlight: boolean;
  features: PlanFeature[];
};

function buildPlans(locale: UiLanguage): PlanConfig[] {
  const p = marketingCopy(locale).plans;
  return [
    {
      tier: "free",
      name: p.free.tier,
      price: p.free.price,
      priceSub: p.free.priceSub,
      tagline: p.free.tagline,
      cta: p.free.cta,
      highlight: false,
      features: [
        ...p.free.features.map((text) => ({ text, included: true })),
        ...p.free.locked.map((text) => ({ text, included: false })),
      ],
    },
    {
      tier: "pro",
      name: p.pro.tier,
      price: p.pro.price,
      priceSub: p.pro.priceSub,
      tagline: p.pro.tagline,
      cta: p.pro.cta,
      highlight: true,
      features: p.pro.features.map((text) => ({ text, included: true })),
    },
  ];
}

// ─── Sub-components ──────────────────────────────────────────────────────

function FeatureRow({ text, included }: PlanFeature) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          included
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-muted text-muted-foreground/40",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className={cn("text-sm", !included && "text-muted-foreground/50 line-through")}>
        {text}
      </span>
    </li>
  );
}

// ─── Main component ──────────────────────────────────────────────────────

type Props = {
  /** Pass null while loading, pass status once fetched, or pass undefined to hide quota bar. */
  billingStatus: BillingStatus | null | undefined;
  onUpgradeSuccess?: (updated: BillingStatus) => void;
};

export function PricingCards({ billingStatus, onUpgradeSuccess }: Props) {
  const { locale } = useLocale();
  const plans = useMemo(() => buildPlans(locale), [locale]);
  const planCopy = useMemo(() => marketingCopy(locale).plans, [locale]);
  const [upgrading, setUpgrading] = useState(false);
  const currentTier: UserTier = billingStatus?.tier ?? "free";

  const handleUpgrade = async () => {
    setUpgrading(true);
    const result = await upgradeToPro();
    setUpgrading(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message);
    onUpgradeSuccess?.(result.billing);
  };

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Quota usage bar — only shown when billing data is loaded */}
      {billingStatus && (
        <QuotaUsageBar status={billingStatus} />
      )}

      {/* Pricing cards */}
      <div className="grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
        {plans.map((plan) => {
          const isCurrentPlan = plan.tier === currentTier;
          const isUpgradeable = plan.tier === "pro" && currentTier === "free";

          return (
            <div
              key={plan.tier}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-8 shadow-sm transition-shadow",
                plan.highlight
                  ? "border-primary/50 shadow-primary/10 shadow-lg ring-1 ring-primary/20"
                  : "border-border",
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="gap-1 bg-primary px-3 py-1 text-primary-foreground shadow">
                    <Crown className="h-3 w-3" />
                    {planCopy.pro.badge}
                  </Badge>
                </div>
              )}

              {/* Plan header */}
              <div className="mb-6">
                <div className="mb-1 flex items-center gap-2">
                  {plan.tier === "pro" ? (
                    <Zap className="h-5 w-5 text-primary" />
                  ) : (
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-lg font-semibold">{plan.name}</span>
                  {isCurrentPlan && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      Đang dùng
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              </div>

              {/* Price */}
              <div className="mb-8">
                <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                <span className="ml-1 text-muted-foreground">{plan.priceSub}</span>
              </div>

              {/* CTA button */}
              {isUpgradeable ? (
                <Button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  className="mb-8 w-full gap-2"
                  size="lg"
                >
                  {upgrading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      {plan.cta}
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  variant={isCurrentPlan ? "secondary" : "outline"}
                  className="mb-8 w-full"
                  size="lg"
                  disabled={isCurrentPlan}
                >
                  {isCurrentPlan ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {plan.cta}
                    </>
                  ) : (
                    plan.cta
                  )}
                </Button>
              )}

              {/* Feature list */}
              <ul className="flex flex-col gap-3">
                {plan.features.map((f) => (
                  <FeatureRow key={f.text} {...f} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Trust note */}
      <p className="flex items-center gap-2 text-center text-sm text-muted-foreground">
        <Shield className="h-4 w-4 shrink-0" />
        {planCopy.footnote}
      </p>
    </div>
  );
}

// ─── Quota bar ────────────────────────────────────────────────────────────

function QuotaUsageBar({ status }: { status: BillingStatus }) {
  const pct = status.defense_turns_limit > 0
    ? Math.min(100, (status.defense_turns_used / status.defense_turns_limit) * 100)
    : 0;
  const isFull = status.defense_turns_remaining === 0;

  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">Defense turns đã dùng</span>
        <span className={cn("font-mono text-xs", isFull ? "text-destructive" : "text-muted-foreground")}>
          {status.defense_turns_used} / {status.defense_turns_limit}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isFull ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {isFull && (
        <p className="mt-2 text-xs text-destructive">
          Bạn đã hết lượt. Nâng cấp Pro để có thêm 50 lượt mỗi tháng.
        </p>
      )}
    </div>
  );
}
