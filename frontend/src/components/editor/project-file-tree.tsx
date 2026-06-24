import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  FileText,
  Folder,
  Image as ImageIcon,
  Upload,
} from "lucide-react";
import type { ProjectAsset, ProjectFile } from "@/lib/project-store";
import {
  buildProjectFileTree,
  collectFolderIds,
  countTreeFiles,
  type ProjectTreeNode,
} from "@/lib/project-file-tree";
import { SHOW_EDITOR_IMPORT } from "@/components/workspace/workspace-layout";
import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProjectFileTreeProps = {
  files: ProjectFile[];
  assets: ProjectAsset[];
  activeFile: string;
  mainFile: string;
  isDirty?: boolean;
  onSelectFile: (path: string) => void;
  onUpload?: () => void;
  onUploadFolder?: () => void;
  onUploadZip?: () => void;
  compact?: boolean;
};

function TreeIcon({ node }: { node: ProjectTreeNode }) {
  switch (node.kind) {
    case "folder":
      return <Folder className="project-file-tree-icon" strokeWidth={1.5} />;
    case "tex":
      return <FileText className="project-file-tree-icon text-primary" strokeWidth={1.5} />;
    case "bib":
      return <BookOpen className="project-file-tree-icon text-amber-600" strokeWidth={1.5} />;
    case "image":
      return <ImageIcon className="project-file-tree-icon text-sky-600" strokeWidth={1.5} />;
    case "support":
      return <File className="project-file-tree-icon text-muted-foreground" strokeWidth={1.5} />;
    default:
      return <File className="project-file-tree-icon text-muted-foreground" strokeWidth={1.5} />;
  }
}

function TreeRow({
  node,
  depth,
  activeFile,
  mainFile,
  mainBadge,
  isDirty,
  expanded,
  onToggleFolder,
  onSelectFile,
}: {
  node: ProjectTreeNode;
  depth: number;
  activeFile: string;
  mainFile: string;
  mainBadge: string;
  isDirty?: boolean;
  expanded: Set<string>;
  onToggleFolder: (id: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const isFolder = node.kind === "folder";
  const isOpen = isFolder && expanded.has(node.id);
  const isActive = !isFolder && node.path === activeFile;
  const paddingLeft = 8 + depth * 14;

  const handleClick = () => {
    if (isFolder) {
      onToggleFolder(node.id);
      return;
    }
    if (node.editable) onSelectFile(node.path);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`project-file-tree-row${isActive ? " is-active" : ""}${!node.editable ? " is-asset" : ""}`}
        style={{ paddingLeft }}
        title={node.path}
      >
        <span className="project-file-tree-chevron" aria-hidden>
          {isFolder ? (
            isOpen ? (
              <ChevronDown className="h-3 w-3" strokeWidth={2} />
            ) : (
              <ChevronRight className="h-3 w-3" strokeWidth={2} />
            )
          ) : null}
        </span>
        <TreeIcon node={node} />
        <span className="project-file-tree-label">{node.name}</span>
        {node.path === mainFile && node.kind === "tex" ? (
          <span className="project-file-tree-badge">{mainBadge}</span>
        ) : null}
        {isActive && isDirty ? <span className="file-dirty-mark">*</span> : null}
      </button>
      {isFolder && isOpen
        ? (node.children ?? []).map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              mainFile={mainFile}
              mainBadge={mainBadge}
              isDirty={isDirty}
              expanded={expanded}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))
        : null}
    </>
  );
}

export function ProjectFileTree({
  files,
  assets,
  activeFile,
  mainFile,
  isDirty,
  onSelectFile,
  onUpload,
  onUploadFolder,
  onUploadZip,
  compact = false,
}: ProjectFileTreeProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const tree = useMemo(() => buildProjectFileTree(files, assets), [files, assets]);
  const fileCount = useMemo(() => countTreeFiles(tree), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [treeOpen, setTreeOpen] = useState(true);

  useEffect(() => {
    setExpanded(new Set(collectFolderIds(tree)));
  }, [tree]);

  const toggleFolder = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`project-file-tree${compact ? " is-compact" : ""}`}>
      <div className="project-file-tree-header">
        <button
          type="button"
          className="project-file-tree-title"
          onClick={() => setTreeOpen((value) => !value)}
          aria-expanded={treeOpen}
        >
          {treeOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          )}
          <span>{t.sidebar.fileTree}</span>
          <span className="project-file-tree-count">{fileCount}</span>
        </button>
        {SHOW_EDITOR_IMPORT ? (
          <div className="project-file-tree-toolbar" role="toolbar" aria-label={t.sidebar.fileActions}>
            {onUpload && onUploadFolder ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="project-file-tree-tool"
                    title={`${t.sidebar.uploadFiles} / ${t.sidebar.uploadFolder}`}
                  >
                    <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  <DropdownMenuItem onClick={onUpload}>
                    <FilePlus className="h-3.5 w-3.5" />
                    {t.sidebar.uploadFiles}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onUploadFolder}>
                    <Folder className="h-3.5 w-3.5" />
                    {t.sidebar.uploadFolder}
                  </DropdownMenuItem>
                  {onUploadZip ? (
                    <DropdownMenuItem onClick={onUploadZip}>
                      <Upload className="h-3.5 w-3.5" />
                      {t.sidebar.importZip}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>

      {treeOpen ? (
        <div className="project-file-tree-body soft-scrollbar">
          {tree.length === 0 ? (
            <p className="project-file-tree-empty">{t.sidebar.emptyTree}</p>
          ) : (
            tree.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                activeFile={activeFile}
                mainFile={mainFile}
                mainBadge={t.sidebar.mainBadge}
                isDirty={isDirty}
                expanded={expanded}
                onToggleFolder={toggleFolder}
                onSelectFile={onSelectFile}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
