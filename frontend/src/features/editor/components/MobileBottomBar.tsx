import { ChevronUp, FileText, MoreHorizontal } from "lucide-react";
import { nibAvatar } from "@/lib/nib-avatar";

export function MobileBottomBar({
  activeFile,
  onOpenChat,
  onOpenFiles,
  onOpenTools,
  isDirty = false,
}: {
  activeFile: string;
  onOpenChat: () => void;
  onOpenFiles: () => void;
  onOpenTools: () => void;
  isDirty?: boolean;
}) {
  return (
    <div className="flex md:hidden shrink-0 items-center justify-between border-t border-border/50 bg-card/95 px-3 py-2.5 backdrop-blur-sm safe-area-pb">
      <button
        type="button"
        onClick={onOpenFiles}
        className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm font-medium transition hover:bg-secondary"
      >
        <FileText className="h-4 w-4 text-primary" />
        <span className="max-w-[8rem] truncate">{activeFile}</span>
        {isDirty && <span className="file-dirty-mark">*</span>}
        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenTools}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground shadow-sm transition hover:bg-secondary"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenChat}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <img src={nibAvatar} alt="Chat with Nib" className="h-6 w-6 object-contain" />
        </button>
      </div>
    </div>
  );
}
