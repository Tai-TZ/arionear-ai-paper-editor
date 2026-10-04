import { FileText } from "lucide-react";

import { useLocale } from "@/components/locale-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { projectsCopy } from "@/lib/projects-i18n";

type ProjectFormatNoticeDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function ProjectFormatNoticeDialog({
  open,
  onConfirm,
  onOpenChange,
}: ProjectFormatNoticeDialogProps) {
  const { locale } = useLocale();
  const t = projectsCopy(locale);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent className="project-format-notice-dialog max-w-md gap-0 overflow-hidden border-2 border-foreground p-0 shadow-[6px_6px_0_0_rgba(0,0,0,0.08)] sm:rounded-none">
        <DialogHeader className="space-y-3 border-b border-foreground/15 px-5 py-5 text-left">
          <div className="flex items-start gap-3">
            <span className="project-format-notice-icon" aria-hidden>
              <FileText className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 space-y-2">
              <DialogTitle className="font-serif-display text-xl font-bold leading-snug tracking-tight">
                {t.formatNoticeTitle}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-foreground/80">
                {t.formatNoticeBody}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 px-5 py-4 text-sm leading-relaxed text-foreground/85">
          <p className="font-sans-ui text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t.formatNoticeImradLabel}
          </p>
          <p>{t.formatNoticeImradDetail}</p>
          <p className="border-t border-foreground/10 pt-3 text-muted-foreground">
            {t.formatNoticeImportNote}
          </p>
        </div>

        <DialogFooter className="border-t border-foreground/15 px-5 py-4 sm:justify-end">
          <button
            type="button"
            onClick={onConfirm}
            className="projects-header-btn projects-header-btn-primary"
          >
            {t.formatNoticeConfirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
