import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import { buildBillingConfirmApiUrl } from "@/lib/billing-confirm-url";

const copy = {
  vi: {
    title: "Đang xác nhận thanh toán",
    body: "Vui lòng đợi trong giây lát…",
  },
  en: {
    title: "Confirming payment",
    body: "Please wait a moment…",
  },
};

export const Route = createFileRoute("/billing/confirm/$checkoutId")({
  head: () => ({
    meta: [{ title: "Confirming payment — Arionear" }],
  }),
  component: BillingConfirmRedirectPage,
});

function BillingConfirmRedirectPage() {
  const { checkoutId } = Route.useParams();
  const { locale } = useLocale();
  const t = locale === "vi" ? copy.vi : copy.en;
  const target = useMemo(() => buildBillingConfirmApiUrl(checkoutId), [checkoutId]);

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 newsprint-texture">
      <div className="w-full max-w-sm border border-foreground/40 bg-background p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" strokeWidth={1.5} />
        <p className="mt-5 font-serif-display text-xl font-bold tracking-tight">{t.title}</p>
        <p className="mt-2 font-body text-sm text-muted-foreground">{t.body}</p>
      </div>
    </div>
  );
}
