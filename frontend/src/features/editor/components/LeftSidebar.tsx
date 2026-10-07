import { memo } from "react";
import { ChevronLeft, ChevronRight, Folder, MessageSquare, ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/locale-context";
import { EditableProjectName } from "@/components/editable-project-name";
import { SidebarFileOutlineSplit } from "@/components/editor/sidebar-file-outline-split";
import { editorCopy } from "@/lib/editor-i18n";
import type { ChatThread, ProjectAsset, ProjectFile } from "@/lib/project-store";
import { ChatThreadList } from "./ChatThreadList";

export const LeftSidebar = memo(function LeftSidebar({
  projectName,
  outlineLatex,
  highlightLine = null,
  onRenameProject,
  onOutlineJump,
  files,
  activeFile,
  mainFile,
  assets,
  tab,
  onTabChange,
  expanded,
  onExpandedChange,
  onSelectFile,
  onUpload,
  onUploadFolder,
  onUploadZip,
  onUploadAsset,
  isDirty = false,
  chatThreads,
  activeChatId,
  onNewChat,
  onSwitchChat,
  onRenameChat,
  onDeleteChat,
}: {
  projectName: string;
  outlineLatex: string;
  highlightLine?: number | null;
  onRenameProject: (name: string) => void | Promise<void>;
  onOutlineJump?: (line: number) => void;
  files: ProjectFile[];
  activeFile: string;
  mainFile: string;
  assets: ProjectAsset[];
  tab: "files" | "chats";
  onTabChange: (t: "files" | "chats") => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectFile: (path: string) => void;
  onUpload: () => void;
  onUploadFolder: () => void;
  onUploadZip: () => void;
  onUploadAsset: () => void;
  isDirty?: boolean;
  chatThreads: ChatThread[];
  activeChatId: string;
  onNewChat: () => void;
  onSwitchChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
}) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const selectTab = (next: "files" | "chats") => {
    onTabChange(next);
    onExpandedChange(true);
  };

  return (
    <div className="editor-left-sidebar">
      <nav className="editor-sidebar-rail" aria-label="Editor sidebar">
        <button
          type="button"
          className={`editor-sidebar-rail-btn${tab === "files" ? " is-active" : ""}`}
          title={t.sidebar.files}
          aria-label={t.sidebar.files}
          aria-pressed={tab === "files"}
          onClick={() => selectTab("files")}
        >
          <Folder className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={`editor-sidebar-rail-btn${tab === "chats" ? " is-active" : ""}`}
          title={t.sidebar.chats}
          aria-label={t.sidebar.chats}
          aria-pressed={tab === "chats"}
          onClick={() => selectTab("chats")}
        >
          <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </nav>

      {expanded ? (
        <aside className="editor-sidebar-panel relative flex min-h-0 flex-col">
          <button
            type="button"
            className="editor-sidebar-toggle editor-sidebar-toggle--collapse"
            title={locale === "vi" ? "Thu gọn sidebar" : "Collapse sidebar"}
            aria-label={locale === "vi" ? "Thu gọn sidebar" : "Collapse sidebar"}
            onClick={() => onExpandedChange(false)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          <div className="border-b border-border p-3">
            <EditableProjectName name={projectName} onRename={onRenameProject} />
          </div>

          <div className="flex border-b border-border">
            {(
              [
                { id: "files" as const, label: t.sidebar.files },
                { id: "chats" as const, label: t.sidebar.chats },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`flex-1 py-2 text-xs font-medium transition ${
                  tab === id
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "files" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SidebarFileOutlineSplit
                files={files}
                assets={assets}
                activeFile={activeFile}
                mainFile={mainFile}
                isDirty={isDirty}
                onSelectFile={onSelectFile}
                onUpload={onUpload}
                onUploadFolder={onUploadFolder}
                onUploadZip={onUploadZip}
                outlineLatex={outlineLatex}
                highlightLine={highlightLine}
                onOutlineJump={onOutlineJump}
              />
            </div>
          ) : (
            <ChatThreadList
              threads={chatThreads}
              activeChatId={activeChatId}
              onNewChat={onNewChat}
              onSwitchChat={onSwitchChat}
              onRenameChat={onRenameChat}
              onDeleteChat={onDeleteChat}
            />
          )}

          <div className="border-t border-border p-3">
            <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-2.5">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-[color:var(--editorial-accent)] shrink-0" />
              <p className="text-[10px] leading-snug text-muted-foreground">
                {t.sidebar.aiDisclaimer}
              </p>
            </div>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          className="editor-sidebar-toggle editor-sidebar-toggle--expand"
          title={locale === "vi" ? "Mở sidebar" : "Expand sidebar"}
          aria-label={locale === "vi" ? "Mở sidebar" : "Expand sidebar"}
          onClick={() => onExpandedChange(true)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
