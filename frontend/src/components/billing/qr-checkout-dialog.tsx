/**
 * QR Checkout Dialog — shown when a user initiates a Pro upgrade.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Clock, ExternalLink, Loader2, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
    title: "Nâng cấp Pro",
    subtitle: "Quét mã QR bằng ứng dụng ngân hàng hoặc ví điện tử.",
    stepScan: "Bước 1 · Quét mã",
    stepWait: "Bước 2 · Xác nhận",
    devLink: "Đang dùng máy tính? Mở liên kết thanh toán",
    waiting: "Đang chờ xác nhận thanh toán",
    expired: "Mã QR đã hết hạn. Đóng và thử lại.",
    success: "Nâng cấp Pro thành công",
    successBody: "Tài khoản của bạn đã được kích hoạt gói Pro.",
    close: "Đóng",
    timerLabel: "Hết hạn sau",
  },
  en: {
    title: "Upgrade to Pro",
    subtitle: "Scan the QR code with your banking or e-wallet app.",
    stepScan: "Step 1 · Scan",
    stepWait: "Step 2 · Confirm",
    devLink: "On desktop? Open payment link",
    waiting: "Waiting for payment confirmation",
    expired: "QR code expired. Close and try again.",
    success: "Pro upgrade complete",
    successBody: "Your account is now on the Pro plan.",
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
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  // Guard against duplicate success calls when two overlapping poll intervals
  // both observe tier === "pro" before the first one clears the interval.
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setConfirmed(false);
      setSecondsLeft(expiresInMinutes * 60);
      successFiredRef.current = false;
      return;
    }

    successFiredRef.current = false;

    pollingRef.current = setInterval(async () => {
      try {
        const status = await fetchBillingStatus();
        if (status.tier === "pro" && !successFiredRef.current) {
          successFiredRef.current = true;
          clearInterval(pollingRef.current!);
          clearInterval(countdownRef.current!);
          setConfirmed(true);
          onSuccessRef.current(status);
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
  }, [open, expiresInMinutes]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const isExpired = secondsLeft === 0 && !confirmed;
  const timer = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden border-foreground p-0 sm:max-w-[400px] sm:rounded-sm">
        <DialogHeader className="space-y-3 border-b border-foreground/20 px-6 pb-5 pt-6 text-left">
          <div className="flex items-start gap-3 pr-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-foreground bg-foreground text-background">
              <Zap className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-serif-display text-2xl font-black tracking-tight">
                {t.title}
              </DialogTitle>
              <DialogDescription className="mt-1.5 font-body text-sm leading-relaxed">
                {t.subtitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-6">
          {confirmed ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center border border-foreground bg-foreground/[0.04]">
                <Check className="h-7 w-7 text-[color:var(--editorial-red)]" strokeWidth={2} />
              </div>
              <div>
                <p className="font-serif-display text-xl font-bold tracking-tight">{t.success}</p>
                <p className="mt-1 font-body text-sm text-muted-foreground">{t.successBody}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex w-full items-center justify-center border border-foreground bg-foreground px-4 py-2.5 font-sans-ui text-[11px] uppercase tracking-widest text-background transition-colors hover:bg-background hover:text-foreground"
              >
                {t.close}
              </button>
            </div>
          ) : isExpired ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center border border-foreground/40">
                <Clock className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="font-body text-sm text-muted-foreground">{t.expired}</p>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center border border-foreground px-4 py-2.5 font-sans-ui text-[11px] uppercase tracking-widest transition-colors hover:bg-foreground hover:text-background"
              >
                {t.close}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-3 font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t.stepScan}
                </p>
                <div className="flex justify-center border border-foreground/30 bg-white p-4">
                  <img
                    src={`data:image/png;base64,${qrPngB64}`}
                    alt="QR code for Pro upgrade"
                    width={192}
                    height={192}
                    className="block h-48 w-48"
                  />
                </div>
              </div>

              <a
                href={confirmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 font-sans-ui text-[11px] uppercase tracking-widest text-muted-foreground underline-offset-4 transition-colors hover:text-[color:var(--editorial-red)] hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
                {t.devLink}
              </a>

              <div>
                <p className="mb-3 font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t.stepWait}
                </p>
                <div className="border border-foreground/30 bg-foreground/[0.02] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 font-body text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.5} />
                      <span className="truncate">{t.waiting}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono-data text-xs tabular-nums",
                        secondsLeft <= 60 ? "text-[color:var(--editorial-red)]" : "text-muted-foreground",
                      )}
                    >
                      {t.timerLabel} {timer}
                    </span>
                  </div>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div
                      className="h-full rounded-full bg-foreground transition-all duration-1000 ease-linear"
                      style={{
                        width: `${Math.max(0, (secondsLeft / (expiresInMinutes * 60)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center border border-foreground/40 px-4 py-2.5 font-sans-ui text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {t.close}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
