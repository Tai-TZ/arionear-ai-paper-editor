import { Check, Copy, Eye, Link2, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { editorCopy } from "@/lib/editor-i18n";
import {
  buildShareUrl,
  disablePaperShare,
  enablePaperShare,
  fetchPaperShareStatus,
  type PaperShareStatus,
} from "@/lib/api/share-api";

type ShareLinkDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperId: string;
  onStatusChange?: (status: PaperShareStatus) => void;
};

export function ShareLinkDialog({
  open,
  onOpenChange,
  paperId,
  onStatusChange,
}: ShareLinkDialogProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale).share;
  const [status, setStatus] = useState<PaperShareStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const applyStatus = useCallback(
    (next: PaperShareStatus) => {
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  useEffect(() => {
    if (!open || !paperId) return;
    setLoading(true);
    setError(null);
    fetchPaperShareStatus(paperId)
      .then(applyStatus)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t.loadError);
      })
      .finally(() => setLoading(false));
  }, [open, paperId, applyStatus, t.loadError]);

  const shareUrl = status?.token ? buildShareUrl(status.token) : "";

  const handleEnable = async () => {
    setWorking(true);
    setError(null);
    try {
      const next = await enablePaperShare(paperId);
      applyStatus(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.createError);
    } finally {
      setWorking(false);
    }
  };

  const handleDisable = async () => {
    setWorking(true);
    setError(null);
    try {
      await disablePaperShare(paperId);
      applyStatus({ enabled: false, token: null, created_at: null });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.disableError);
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t.copyError);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="share-dialog-content max-w-[34rem] gap-0 overflow-hidden border-2 border-foreground p-0 shadow-[8px_8px_0_0_rgba(0,0,0,0.08)] sm:rounded-none [&>button.absolute]:right-4 [&>button.absolute]:top-4 [&>button.absolute]:z-10 [&>button.absolute]:rounded-md [&>button.absolute]:text-background [&>button.absolute]:opacity-90 [&>button.absolute]:hover:bg-background/15 [&>button.absolute]:hover:opacity-100">
        <div className="share-dialog-header border-b border-background/15 bg-foreground px-6 py-5 pr-14 text-background">
          <p className="font-sans-ui text-[10px] uppercase tracking-[0.22em] text-background/60">
            {t.circulationDesk}
          </p>
          <DialogTitle className="mt-2 font-serif-display text-2xl font-bold tracking-tight text-background">
            {t.title}
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-sm text-sm leading-relaxed text-background/75">
            {t.description}
          </DialogDescription>
        </div>

        <div className="share-dialog-body bg-background px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          ) : (
            <div className="space-y-5">
              {error ? (
                <p className="rounded-none border border-[color:var(--editorial-red)]/35 bg-[color:var(--editorial-red)]/5 px-4 py-3 text-sm text-[color:var(--editorial-red)]">
                  {error}
                </p>
              ) : null}

              {status?.enabled && shareUrl ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="share-dialog-note border border-border/70 bg-muted/20 px-3 py-3">
                      <Eye className="mb-2 h-4 w-4 text-[color:var(--editorial-red)]" aria-hidden />
                      <p className="font-sans-ui text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t.viewOnly}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground/75">
                        {t.viewOnlyHint}
                      </p>
                    </div>
                    <div className="share-dialog-note border border-border/70 bg-muted/20 px-3 py-3">
                      <ShieldCheck
                        className="mb-2 h-4 w-4 text-[color:var(--editorial-red)]"
                        aria-hidden
                      />
                      <p className="font-sans-ui text-[10px] uppercase tracking-widest text-muted-foreground">
                        {t.stableLink}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-foreground/75">
                        {t.stableLinkHint}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block font-sans-ui text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t.viewOnlyLink}
                    </label>
                    <div className="share-dialog-link-box border border-foreground/20 bg-[color:var(--muted)]/40">
                      <div className="flex items-start gap-3 border-b border-foreground/10 px-4 py-3">
                        <Link2
                          className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--editorial-red)]"
                          aria-hidden
                        />
                        <p className="min-w-0 flex-1 break-all font-mono text-[12px] leading-6 text-foreground/90">
                          {shareUrl}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className="share-dialog-copy-btn flex w-full items-center justify-center gap-2 bg-foreground px-4 py-3 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-background transition hover:bg-background hover:text-foreground"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4" aria-hidden />
                            {t.copied}
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" aria-hidden />
                            {t.copyLink}
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/60 pt-4">
                    <p className="text-xs text-muted-foreground">{t.disableHint}</p>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void handleDisable()}
                      className="font-sans-ui text-[10px] uppercase tracking-widest text-muted-foreground underline underline-offset-4 transition hover:text-[color:var(--editorial-red)] disabled:opacity-50"
                    >
                      {t.disableSharing}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <ul className="space-y-2 text-sm text-foreground/75">
                    <li className="flex gap-2">
                      <span className="text-[color:var(--editorial-red)]">—</span>
                      {t.bulletPermanent}
                    </li>
                    <li className="flex gap-2">
                      <span className="text-[color:var(--editorial-red)]">—</span>
                      {t.bulletLive}
                    </li>
                  </ul>
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void handleEnable()}
                    className="inline-flex w-full items-center justify-center gap-2 border border-foreground bg-foreground px-4 py-3 font-sans-ui text-[11px] uppercase tracking-[0.16em] text-background transition hover:bg-background hover:text-foreground disabled:opacity-50"
                  >
                    {working ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Link2 className="h-4 w-4" aria-hidden />
                    )}
                    {t.createLink}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
