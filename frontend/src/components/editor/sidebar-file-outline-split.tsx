import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import { ProjectFileTree } from "@/components/editor/project-file-tree";
import { LatexOutlineNav } from "@/components/latex-outline-nav";
import type { ProjectAsset, ProjectFile } from "@/lib/project-store";

type SidebarFileOutlineSplitProps = {
  files: ProjectFile[];
  assets: ProjectAsset[];
  activeFile: string;
  mainFile: string;
  isDirty?: boolean;
  onSelectFile: (path: string) => void;
  onUpload?: () => void;
  onUploadFolder?: () => void;
  onUploadZip?: () => void;
  outlineLatex: string;
  highlightLine?: number | null;
  onOutlineJump?: (line: number) => void;
  compact?: boolean;
};

export function SidebarFileOutlineSplit({
  files,
  assets,
  activeFile,
  mainFile,
  isDirty,
  onSelectFile,
  onUpload,
  onUploadFolder,
  onUploadZip,
  outlineLatex,
  highlightLine = null,
  onOutlineJump,
  compact = false,
}: SidebarFileOutlineSplitProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale);

  return (
    <ResizablePanelGroup
      id="sidebar-file-outline"
      autoSaveId="arionear-sidebar-files-outline"
      orientation="vertical"
      className="sidebar-file-outline-split"
      defaultLayout={{ "file-tree": 62, outline: 38 }}
    >
      <ResizablePanel
        id="file-tree"
        defaultSize={62}
        minSize={24}
        className="flex min-h-0 min-w-0 flex-col"
      >
        <ProjectFileTree
          files={files}
          assets={assets}
          activeFile={activeFile}
          mainFile={mainFile}
          isDirty={isDirty}
          onSelectFile={onSelectFile}
          onUpload={onUpload}
          onUploadFolder={onUploadFolder}
          onUploadZip={onUploadZip}
          compact={compact}
        />
      </ResizablePanel>

      <ResizableHandle withHandle className="sidebar-outline-resize-handle" />

      <ResizablePanel
        id="outline"
        defaultSize={38}
        minSize={16}
        className="flex min-h-0 min-w-0 flex-col"
      >
        <div className="sidebar-outline-pane soft-scrollbar">
          <span className="sidebar-outline-label">{t.sidebar.outline}</span>
          <div className="sidebar-outline-nav">
            <LatexOutlineNav
              latex={outlineLatex}
              activeLine={highlightLine}
              onJumpToLine={onOutlineJump}
              compact={!compact}
            />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
