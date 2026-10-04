import { useRef, useState } from "react";
import { Check, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale } from "@/components/locale-context";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { editorCopy } from "@/lib/editor-i18n";
import type { ChatThread } from "@/lib/project-store";

export function ChatThreadList({
  threads,
  activeChatId,
  onNewChat,
  onSwitchChat,
  onRenameChat,
  onDeleteChat,
}: {
  threads: ChatThread[];
  activeChatId: string;
  onNewChat: () => void;
  onSwitchChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
}) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameValue(current);
    setTimeout(() => renameInputRef.current?.select(), 20);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameChat(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
      onDeleteChat(deleteTargetId);
    }
    setDeleteTargetId(null);
  };

  const deleteTargetTitle = threads.find((th) => th.id === deleteTargetId)?.title ?? "";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t.sidebar.noChats}</p>
          ) : (
            threads.map((thread) => {
              const isActive = thread.id === activeChatId;
              const isRenaming = renamingId === thread.id;
              return (
                <div
                  key={thread.id}
                  className={`group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 transition ${
                    isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
                  }`}
                >
                  <MessageSquare
                    className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                  />
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      className="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-[12px] outline-none focus:border-primary"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        // IME composition (Vietnamese, CJK…): Enter picks the candidate, it must not submit.
                        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      className={`min-w-0 flex-1 truncate text-left text-[13px] ${
                        isActive ? "font-medium text-foreground" : "text-foreground/70"
                      }`}
                      onClick={() => onSwitchChat(thread.id)}
                      title={thread.title}
                    >
                      {thread.title}
                    </button>
                  )}
                  {!isRenaming && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground transition"
                        title={t.sidebar.renameChat}
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(thread.id, thread.title);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        className="rounded p-0.5 text-muted-foreground hover:text-destructive transition"
                        title={t.sidebar.deleteChat}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(thread.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {isRenaming && (
                    <button
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground transition"
                      onClick={commitRename}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="shrink-0 border-t border-border p-2">
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground transition hover:border-primary hover:text-foreground"
            onClick={onNewChat}
          >
            <Plus className="h-3.5 w-3.5" />
            {t.sidebar.newChat}
          </button>
        </div>
      </div>

      <Dialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <DialogContent className="max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t.sidebar.deleteChat}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {t.sidebar.deleteChatConfirm}
            {deleteTargetTitle ? (
              <>
                {" "}
                — <span className="font-medium text-foreground">"{deleteTargetTitle}"</span>
              </>
            ) : null}
          </p>
          <DialogFooter className="mt-1 gap-2">
            <button
              className="rounded-md border border-border px-3 py-1.5 text-[13px] transition hover:bg-secondary"
              onClick={() => setDeleteTargetId(null)}
            >
              {locale === "vi" ? "Hủy" : "Cancel"}
            </button>
            <button
              className="rounded-md bg-destructive px-3 py-1.5 text-[13px] font-medium text-destructive-foreground transition hover:opacity-90"
              onClick={confirmDelete}
            >
              {t.sidebar.deleteChat}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
