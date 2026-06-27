/**
 * QR Checkout Dialog — shown when a user initiates a Pro upgrade.
 *
 * Flow:
 *  1. Parent calls createCheckout() and passes the result here.
 *  2. Dialog renders the base-64 QR PNG and a direct test link.
 *  3. Every 3 s we poll /billing/status; when tier flips to "pro" we call onSuccess.
 *
 * V2 (Stripe): the confirm_url will point to a Stripe-hosted page.
 *  The polling approach still works unchanged.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/components/locale-provider";
import { fetchBillingStatus, type BillingStatus } from "@/lib/api/billing-api";

const POLL_INTERVAL_MS = 3_000;

type Props = {
  open: boolean;
  confirmUrl: string;
  qrPngB64: string;
  expiresInMinutes: number;
  onSuccess: (billing: BillingStatus) => void;
  onClose: () => void;
};

const copy = {
  vi: {
    title: "Quét QR để nâng cấp Pro",
    scan: "Dùng camera điện thoại để quét mã QR bên dưới.",
    devLink: "Đang test trên máy tính? Nhấn vào đây để mở trực tiếp",
    waiting: "Đang chờ xác nhận…",
    expired: "Mã QR đã hết hạn. Vui lòng đóng và thử lại.",
    success: "Tài khoản đã được nâng cấp lên Pro! ⚡",
    close: "Đóng",
    timerLabel: "Còn lại",
  },
  en: {
    title: "Scan QR to upgrade to Pro",
    scan: "Use your phone camera to scan the QR code below.",
    devLink: "Testing on desktop? Click here to open directly",
    waiting: "Waiting for payment confirmation…",
    expired: "QR code expired. Please close and try again.",
    success: "Account upgraded to Pro! ⚡",
    close: "Close",
    timerLabel: "Expires in",
  },
};

export function QrCheckoutDialog({
  open,
  confirmUrl,
  qrPngB64,
  expiresInMinutes,
  onSuccess,
  onClose,
}: Props) {
  const { locale } = useLocale();
  const t = locale === "vi" ? copy.vi : copy.en;

  const [confirmed, setConfirmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(expiresInMinutes * 60);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmed(false);
      setSecondsLeft(expiresInMinutes * 60);
      return;
    }

    pollingRef.current = setInterval(async () => {
      try {
        const status = await fetchBillingStatus();
        if (status.tier === "pro") {
          clearInterval(pollingRef.current!);
          clearInterval(countdownRef.current!);
          setConfirmed(true);
          onSuccess(status);
        }
      } catch {
        /* network error — keep polling */
      }
    }, POLL_INTERVAL_MS);

    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(countdownRef.current!);
          clearInterval(pollingRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1_000);

    return () => {
      clearInterval(pollingRef.current!);
      clearInterval(countdownRef.current!);
    };
  }, [open, expiresInMinutes, onSuccess]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isExpired = secondsLeft === 0 && !confirmed;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            ⚡ {t.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 pb-2">
          {confirmed ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center gap-4 py-6">
              <CheckCircle2 className="h-16 w-16 text-emerald-500" />
              <p className="text-center font-semibold text-emerald-600">{t.success}</p>
              <Button onClick={onClose}>{t.close}</Button>
            </div>
          ) : isExpired ? (
            /* ── Expired state ── */
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Clock className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t.expired}</p>
              <Button variant="outline" onClick={onClose}>{t.close}</Button>
            </div>
          ) : (
            /* ── Scanning state ── */
            <>
              {/* QR image from backend-generated base64 PNG */}
              <div className="rounded-2xl border-4 border-primary/20 bg-white p-3 shadow-inner">
                <img
                  src={`data:image/png;base64,${qrPngB64}`}
                  alt="QR code for Pro upgrade"
                  width={200}
                  height={200}
                  className="block"
                />
              </div>

              <p className="text-center text-sm text-muted-foreground">{t.scan}</p>

              {/* Direct link for desktop testing */}
              <a
                href={confirmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t.devLink}
              </a>

              {/* Polling indicator + countdown */}
              <div className="flex w-full items-center justify-between rounded-lg border bg-muted/50 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t.waiting}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {t.timerLabel} {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </span>
              </div>

              <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClose}>
                <X className="h-3.5 w-3.5" />
                {t.close}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
