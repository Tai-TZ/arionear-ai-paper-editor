import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import { hasBlockingIntegrityFlags } from "@/lib/integrity-flags";
import { isPendingEditStale } from "@/lib/pending-edit-utils";
import type { PendingEdit } from "../types";

export function PendingEditsPanel({
  pendingEdits,
  activeEditId,
  mainFile,
  resolveFileContent,
  onSelectEdit,
  onAcceptEdit,
  onRejectEdit,
  onAcceptAll,
  onRejectAll,
}: {
  pendingEdits: PendingEdit[];
  activeEditId?: string | null;
  mainFile: string;
  resolveFileContent?: (filePath: string) => string;
  onSelectEdit?: (id: string) => void;
  onAcceptEdit?: (id: string) => void;
  onRejectEdit?: (id: string) => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
}) {
  const { locale } = useLocale();
  const t = editorCopy(locale);

  const pendingEditsBlocked = pendingEdits.some((e) => hasBlockingIntegrityFlags(e.flags));
  const pendingEditsStale = pendingEdits.some((e) =>
    resolveFileContent ? isPendingEditStale(e, resolveFileContent(e.file || mainFile)) : false,
  );

  const isSingle = pendingEdits.length === 1;

  return (
    <div className="suggestion-panel shrink-0 border-t border-primary/15 bg-card/98 shadow-[0_-4px_20px_-8px_oklch(0.2_0.02_255_/_12%)] backdrop-blur-sm">
      {!isSingle ? (
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <span>{t.pendingEdits.title(pendingEdits.length)}</span>
            <span className="text-[10px] font-normal text-muted-foreground">{t.pendingEdits.hint}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRejectAll}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary"
            >
              {t.pendingEdits.rejectAll}
            </button>
            <button
              type="button"
              onClick={onAcceptAll}
              disabled={pendingEditsBlocked || pendingEditsStale}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.pendingEdits.acceptAll}
            </button>
          </div>
        </div>
      ) : null}
      {pendingEditsBlocked ? (
        <p className="px-3 pb-1 pt-2 text-[11px] text-destructive">{t.pendingEdits.integrityBlocked}</p>
      ) : null}
      {pendingEditsStale && !pendingEditsBlocked ? (
        <p className={`px-3 pb-1 text-[11px] text-amber-700 dark:text-amber-400 ${isSingle ? "pt-2" : ""}`}>
          {t.pendingEdits.staleWarning}
        </p>
      ) : null}
      <div className={`px-3 ${isSingle ? "py-2" : "pb-2"}`}>
        <div className="flex flex-col gap-1">
          {pendingEdits.map((e) => {
            const editBlocked = hasBlockingIntegrityFlags(e.flags);
            const editStale = resolveFileContent
              ? isPendingEditStale(e, resolveFileContent(e.file || mainFile))
              : false;
            return (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectEdit?.(e.id)}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter" || evt.key === " ") {
                    evt.preventDefault();
                    onSelectEdit?.(e.id);
                  }
                }}
                className={`text-left rounded-md border px-2.5 py-2 text-xs transition ${
                  isSingle || activeEditId === e.id
                    ? "border-primary/35 bg-primary/10"
                    : "border-border/60 hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {e.description || t.pendingEdits.proposedChange}
                      {e.section ? ` · ${e.section}` : ""}
                      {editStale ? (
                        <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                          {t.pendingEdits.staleBadge}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {e.file} · {e.applyMode}
                      {isSingle ? (
                        <span className="ml-1.5 text-[10px] text-muted-foreground/80">
                          · {t.pendingEdits.hint}
                        </span>
                      ) : null}
                    </div>
                    {e.flags.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-[10px]">
                        {e.flags.map((f, i) => (
                          <li
                            key={`${f.code}-${i}`}
                            className={
                              f.severity === "error"
                                ? "text-destructive"
                                : "text-amber-700 dark:text-amber-400"
                            }
                          >
                            {f.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onRejectEdit?.(e.id);
                      }}
                      className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                    >
                      {t.pendingEdits.reject}
                    </button>
                    <button
                      type="button"
                      onClick={(evt) => {
                        evt.stopPropagation();
                        onAcceptEdit?.(e.id);
                      }}
                      disabled={editBlocked || editStale}
                      className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.pendingEdits.accept}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
