import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Check, Zap, Loader2, X, Shield } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/components/locale-context";
import { marketingCopy } from "@/lib/marketing-i18n";
import type { UiLanguage } from "@/lib/researcher-profile";
import { type BillingStatus, type UserTier, createCheckout } from "@/lib/api/billing-api";
import { editorEntryPath } from "@/lib/require-auth";
import { QrCheckoutDialog } from "@/components/billing/qr-checkout-dialog";

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

function FeatureRow({ text, included }: PlanFeature) {
  return (
    <li className={cn("flex items-start gap-2.5", !included && "opacity-45")}>
      {included ? (
        <Check
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--editorial-red)]"
          strokeWidth={2.5}
        />
      ) : (
        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
      )}
      <span
        className={cn(
          "font-body text-sm leading-snug",
          !included && "line-through text-muted-foreground",
        )}
      >
        {text}
      </span>
    </li>
  );
}

function PlanCta({
  isCurrentPlan,
  isUpgradeable,
  isGuestUpgrade,
  isFreeEntry,
  upgrading,
  cta,
  currentPlanCta,
  upgradingLabel,
  onUpgrade,
}: {
  isCurrentPlan: boolean;
  isUpgradeable: boolean;
  isGuestUpgrade: boolean;
  isFreeEntry: boolean;
  upgrading: boolean;
  cta: string;
  currentPlanCta: string;
  upgradingLabel: string;
  onUpgrade: () => void;
}) {
  const base =
    "inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 font-sans-ui text-[11px] uppercase tracking-widest transition-all min-h-[42px]";

  if (isCurrentPlan) {
    return (
      <button
        type="button"
        disabled
        aria-current="true"
        className={cn(
          base,
          "border border-foreground bg-foreground/5 text-foreground cursor-default",
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        {currentPlanCta}
      </button>
    );
  }

  if (isUpgradeable) {
    return (
      <button
        type="button"
        onClick={onUpgrade}
        disabled={upgrading}
        className={cn(
          base,
          "border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground disabled:opacity-60",
        )}
      >
        {upgrading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {upgradingLabel}
          </>
        ) : (
          <>
            <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
            {cta}
          </>
        )}
      </button>
    );
  }

  if (isGuestUpgrade) {
    return (
      <Link
        to="/signin"
        className={cn(
          base,
          "border border-foreground bg-foreground text-background hover:bg-background hover:text-foreground",
        )}
      >
        <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
        {cta}
      </Link>
    );
  }

  if (isFreeEntry) {
    return (
      <Link
        to={editorEntryPath()}
        className={cn(
          base,
          "border border-foreground/60 bg-transparent hover:border-foreground hover:bg-foreground hover:text-background",
        )}
      >
        {cta}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled
      className={cn(base, "border border-foreground/25 text-muted-foreground cursor-default")}
    >
      {cta}
    </button>
  );
}

function QuotaUsageBarSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 border border-foreground/30 bg-foreground/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      aria-hidden
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="w-full space-y-2 sm:max-w-[200px] sm:flex-1">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

type Props = {
  billingStatus: BillingStatus | null | undefined;
  billingLoading?: boolean;
  billingError?: boolean;
  onUpgradeSuccess?: (updated: BillingStatus) => void;
};

export function PricingCards({
  billingStatus,
  billingLoading = false,
  billingError = false,
  onUpgradeSuccess,
}: Props) {
  const { locale } = useLocale();
  const plans = useMemo(() => buildPlans(locale), [locale]);
  const planCopy = useMemo(() => marketingCopy(locale).plans, [locale]);
  const [upgrading, setUpgrading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<{
    confirmUrl: string;
    qrPngB64: string;
    expiresInMinutes: number;
  } | null>(null);
  const currentTier = billingStatus?.tier ?? null;
  const showQuota = billingLoading || billingStatus != null;

  const handleUpgrade = async () => {
    setUpgrading(true);
    const result = await createCheckout();
    setUpgrading(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setQrData({
      confirmUrl: result.confirmUrl,
      qrPngB64: result.qrPngB64,
      expiresInMinutes: result.expiresInMinutes,
    });
    setQrOpen(true);
  };

  return (
    <div className="flex flex-col gap-8">
      {showQuota &&
        (billingLoading ? (
          <QuotaUsageBarSkeleton />
        ) : (
          billingStatus && <QuotaUsageBar status={billingStatus} copy={planCopy} locale={locale} />
        ))}

      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 items-stretch gap-5 sm:grid-cols-2">
        {plans.map((plan) => {
          const isCurrentPlan = currentTier !== null && plan.tier === currentTier;
          // When billing errored but user is authenticated, allow upgrade attempt
          // (server will reject if already Pro); never show "sign in" to a logged-in user.
          const isUpgradeable =
            plan.tier === "pro" &&
            (currentTier === "free" || (billingError && currentTier === null));
          const isGuestUpgrade = plan.tier === "pro" && currentTier === null && !billingError;
          // Pro users can still open the editor — show the link, not a disabled button.
          const isFreeEntry = plan.tier === "free" && !isCurrentPlan;
          const TierIcon = plan.highlight ? Zap : BookOpen;

          return (
            <article
              key={plan.tier}
              className={cn(
                "relative flex flex-col rounded-sm border bg-background p-5 sm:p-6",
                plan.highlight
                  ? "border-foreground shadow-[3px_3px_0_0_var(--foreground)]"
                  : "border-foreground/40",
                isCurrentPlan && "border-foreground",
              )}
            >
              {plan.highlight && (
                <div className="absolute top-0 right-0 bg-[color:var(--editorial-red)] px-2.5 py-1">
                  <span className="font-mono-data text-[10px] uppercase tracking-widest text-background">
                    {planCopy.pro.badge}
                  </span>
                </div>
              )}

              <div className="mb-5">
                <div className={cn("flex items-center gap-2.5", plan.highlight && "pr-16")}>
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center border",
                      plan.highlight
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/60",
                    )}
                  >
                    <TierIcon className="h-4 w-4" strokeWidth={1.5} />
                  </div>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="font-serif-display text-3xl font-black tracking-tighter leading-none">
                      {plan.price}
                    </span>
                    <span className="font-mono-data text-xs text-muted-foreground">
                      {plan.priceSub}
                    </span>
                  </div>
                </div>
                <p className="mt-2 font-body text-sm leading-snug text-muted-foreground">
                  {plan.tagline}
                </p>
              </div>

              <div className="mb-5 border-t border-foreground/15 pt-5">
                <p className="mb-3 font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground">
                  {locale === "vi" ? "Bao gồm" : "Includes"}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <FeatureRow key={f.text} {...f} />
                  ))}
                </ul>
              </div>

              <div className="mt-auto">
                <PlanCta
                  isCurrentPlan={isCurrentPlan}
                  isUpgradeable={isUpgradeable}
                  isGuestUpgrade={isGuestUpgrade}
                  isFreeEntry={isFreeEntry}
                  upgrading={upgrading}
                  cta={plan.cta}
                  currentPlanCta={planCopy.currentPlanCta}
                  upgradingLabel={planCopy.upgrading}
                  onUpgrade={handleUpgrade}
                />
              </div>
            </article>
          );
        })}
      </div>

      <p className="flex items-center justify-center gap-2 text-center font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground">
        <Shield className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        {planCopy.footnote}
      </p>

      {qrData && (
        <QrCheckoutDialog
          open={qrOpen}
          confirmUrl={qrData.confirmUrl}
          qrPngB64={qrData.qrPngB64}
          expiresInMinutes={qrData.expiresInMinutes}
          onSuccess={(billing) => {
            setQrOpen(false);
            toast.success(
              locale === "vi" ? "Tài khoản đã được nâng cấp lên Pro!" : "Account upgraded to Pro!",
            );
            onUpgradeSuccess?.(billing);
          }}
          onClose={() => setQrOpen(false)}
        />
      )}
    </div>
  );
}

function QuotaUsageBar({
  status,
  copy,
  locale,
}: {
  status: BillingStatus;
  copy: ReturnType<typeof marketingCopy>["plans"];
  locale: UiLanguage;
}) {
  const pct =
    status.defense_turns_limit > 0
      ? Math.min(100, (status.defense_turns_used / status.defense_turns_limit) * 100)
      : 0;
  const isFull = status.defense_turns_remaining === 0;
  const remaining = status.defense_turns_limit - status.defense_turns_used;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 border border-foreground/30 bg-foreground/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <p className="font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground">
          {copy.quotaLabel}
        </p>
        <p className="mt-1 font-serif-display text-xl font-bold tracking-tight">
          {status.defense_turns_used}
          <span className="font-mono-data text-sm font-normal text-muted-foreground">
            {" "}
            / {status.defense_turns_limit}
            <span className="ml-1.5 text-[11px] uppercase tracking-widest">
              {copy.quotaPeriodDaily}
            </span>
          </span>
        </p>
      </div>

      <div className="w-full sm:max-w-[200px] sm:flex-1">
        <div className="mb-2 flex justify-between font-mono-data text-[10px] uppercase tracking-widest">
          <span className="text-muted-foreground">{locale === "vi" ? "Đã dùng" : "Used"}</span>
          <span className={cn(isFull ? "text-destructive" : "text-muted-foreground")}>
            {isFull
              ? locale === "vi"
                ? "Hết lượt"
                : "Limit reached"
              : locale === "vi"
                ? `Còn ${remaining}`
                : `${remaining} left`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isFull ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-foreground",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {isFull && <p className="mt-2 font-body text-xs text-destructive">{copy.quotaFull}</p>}
      </div>
    </div>
  );
}
