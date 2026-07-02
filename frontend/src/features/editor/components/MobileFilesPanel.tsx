import { useState } from "react";
import { Folder, MessageSquare, ShieldCheck } from "lucide-react";
import { EditableProjectName } from "@/components/editable-project-name";
import { SidebarFileOutlineSplit } from "@/components/editor/sidebar-file-outline-split";
import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import type { ChatThread, ProjectAsset, ProjectFile } from "@/lib/project-store";
import { ChatThreadList } from "./ChatThreadList";

export function MobileFilesPanel({
  projectName,
  outlineLatex,
  highlightLine = null,
  onRenameProject,
  onOutlineJump,
  files,
  activeFile,
  mainFile,
  assets,
  onSelectFile,
  onUpload,
  onUploadFolder,
  onUploadZip,
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
  onSelectFile: (path: string) => void;
  onUpload: () => void;
  onUploadFolder: () => void;
  onUploadZip: () => void;
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
  const [tab, setTab] = useState<"files" | "chats">("files");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sidebar">
      <div className="shrink-0 border-b border-border/40 p-4">
        <EditableProjectName name={projectName} onRename={onRenameProject} />
      </div>

      <nav className="flex shrink-0 border-b border-border/40">
        <button
          type="button"
          onClick={() => setTab("files")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition ${
            tab === "files"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground"
          }`}
        >
          <Folder className="h-4 w-4" />
          {t.mobile.files}
        </button>
        <button
          type="button"
          onClick={() => setTab("chats")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition ${
            tab === "chats"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          {t.mobile.chats}
        </button>
      </nav>

      {tab === "files" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 pb-2">
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
            compact
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

      <div className="shrink-0 border-t border-border/40 p-4">
        <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-[color:var(--editorial-red)] shrink-0" />
          <p className="text-xs leading-snug text-muted-foreground">
            AI hỗ trợ diễn đạt — không bịa dữ liệu hay kết quả.
          </p>
        </div>
      </div>
    </div>
  );
}
