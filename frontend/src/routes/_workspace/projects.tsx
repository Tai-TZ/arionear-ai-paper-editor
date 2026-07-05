import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Plus,
  FileText,
  Pencil,
  FolderOpen,
  FileArchive,
  Trash2,
  Loader2,
  BookOpen,
  GraduationCap,
} from "lucide-react";
import { refreshSession } from "@/lib/auth-store";
import {
  SHOW_PROJECTS_IMPORT,
} from "@/components/workspace/workspace-layout";
import {
  createPaper,
  createPaperFromImport,
  deletePaper,
  fetchPapers,
  updatePaper,
} from "@/lib/api/papers-api";
import {
  blankLatexForLocale,
  sampleLatexForLocale,
  formatTimeAgo,
  formatProjectDateTime,
  isTexFile,
  type StoredProject,
} from "@/lib/project-store";
import { importLatexFileList, type LatexImportResult } from "@/lib/latex-import";
import { importOverleafZip } from "@/lib/overleaf-import";
import { markEditorEntryTransition } from "@/components/editor-entry-splash";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { ProjectsListSkeleton } from "@/components/workspace/workspace-content-skeleton";
import { useLocale } from "@/components/locale-provider";
import { commonCopy } from "@/lib/common-i18n";
import { projectsCopy } from "@/lib/projects-i18n";
import {
  EditableProjectName,
  type EditableProjectNameHandle,
} from "@/components/editable-project-name";
import { toast } from "sonner";
import {
  ProjectFormatNoticeDialog,
  hasAcknowledgedProjectFormatNotice,
  useProjectFormatNotice,
} from "@/components/projects/project-format-notice-dialog";

export const Route = createFileRoute("/_workspace/projects")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Projects — Arionear" },
      {
        name: "description",
        content: "Write IMRaD scientific papers in IEEE format, or import from Overleaf.",
      },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => projectsCopy(locale), [locale]);
  const workspace = useMemo(() => commonCopy(locale).workspace, [locale]);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingLabel, setCreatingLabel] = useState<string | null>(null);
  const [creatingDetail, setCreatingDetail] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const { open: formatNoticeOpen, setOpen: setFormatNoticeOpen, runWithNotice, confirm: confirmFormatNotice, dismiss: dismissFormatNotice } =
    useProjectFormatNotice();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadError(null);

      try {
        void refreshSession().catch(() => {});
        const list = await fetchPapers();
        if (cancelled) return;
        setProjects(list);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load projects.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  useEffect(() => {
    if (loading || filtered.length > 0 || search.trim()) return;
    if (hasAcknowledgedProjectFormatNotice()) return;
    setFormatNoticeOpen(true);
  }, [loading, filtered.length, search, setFormatNoticeOpen]);

  const openEditor = (projectId: string) => {
    if (!projectId.trim()) return;
    markEditorEntryTransition();
    void navigate({
      to: "/editor",
      search: { projectId: projectId.trim() },
    });
  };

  const openDefense = (projectId: string) => {
    if (!projectId.trim()) return;
    void navigate({
      to: "/defense",
      search: { projectId: projectId.trim() },
    });
  };

  const handleImportedProject = async (imported: LatexImportResult) => {
    const project = await createPaperFromImport(imported);
    setProjects((prev) => [project, ...prev]);
    const imageCount = (project.assets ?? []).filter((a) =>
      /\.(png|jpe?g|gif|webp|svg|pdf|eps)$/i.test(a.name),
    ).length;
    toast.success(
      `Đã import ${imported.files.length} file .tex, ${imageCount} ảnh (${(project.assets ?? []).length} assets).`,
    );
    openEditor(project.id);
  };

  const handleCreateSample = async () => {
    setCreatingLabel(t.creatingSample);
    setNewMenuOpen(false);
    try {
      const project = await createPaper(t.sampleProjectName, sampleLatexForLocale(locale));
      setProjects((prev) => [project, ...prev]);
      openEditor(project.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.errorCreate);
    } finally {
      setCreatingLabel(null);
    }
  };

  const handleCreateBlank = async () => {
    setCreatingLabel(t.creatingBlank);
    setNewMenuOpen(false);
    try {
      const project = await createPaper(t.blankProjectName, blankLatexForLocale(locale));
      setProjects((prev) => [project, ...prev]);
      openEditor(project.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.errorCreate);
    } finally {
      setCreatingLabel(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    if (!files.some((f) => isTexFile(f.name))) {
      setLoadError(t.errorNoTex);
      return;
    }

    setCreatingLabel(t.uploading);
    setNewMenuOpen(false);
    try {
      const imported = await importLatexFileList(files);
      await handleImportedProject(imported);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.errorUpload);
    } finally {
      setCreatingLabel(null);
    }
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCreatingLabel(t.importingZip);
    setCreatingDetail(t.importingZipDetail);
    setNewMenuOpen(false);
    setLoadError(null);
    try {
      const imported = await importOverleafZip(file);
      await handleImportedProject(imported);
    } catch (error) {
      const message = error instanceof Error ? error.message : t.errorImport;
      setLoadError(message);
      toast.error(message);
    } finally {
      setCreatingLabel(null);
      setCreatingDetail(null);
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      const updated = await updatePaper(id, { name });
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.errorRename);
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await deletePaper(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.errorDelete);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <>
      {creatingLabel ? (
        <AppLoadingScreen
          variant="overlay"
          label={creatingLabel}
          detail={creatingDetail ?? undefined}
        />
      ) : null}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleUpload}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleZipImport}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="projects-workspace-header workspace-main-header flex shrink-0 items-center justify-between border-b border-border/50">
          <div className="projects-header-title">
            <h1>{t.headerTitle}</h1>
          </div>

          <div className="projects-header-toolbar">
            <Link
              to="/guide"
              className="projects-header-btn projects-header-btn-guide hidden sm:inline-flex"
              title={workspace.userGuide}
            >
              <BookOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>{workspace.userGuide}</span>
            </Link>

            <div className="projects-header-search">
              <Search strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchAria}
              />
            </div>

            <div className="projects-view-toggle" role="group" aria-label={t.viewAria}>
              <button
                type="button"
                onClick={() => setView("list")}
                className={`projects-view-btn ${view === "list" ? "is-active" : ""}`}
                aria-label={t.listView}
                aria-pressed={view === "list"}
              >
                <List className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => setView("grid")}
                className={`projects-view-btn ${view === "grid" ? "is-active" : ""}`}
                aria-label={t.gridView}
                aria-pressed={view === "grid"}
              >
                <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="projects-header-new relative">
              <button
                type="button"
                onClick={() => {
                  if (newMenuOpen) {
                    setNewMenuOpen(false);
                    return;
                  }
                  runWithNotice(() => setNewMenuOpen(true));
                }}
                disabled={!!creatingLabel}
                className="projects-header-btn projects-header-btn-primary"
                aria-expanded={newMenuOpen}
                aria-haspopup="menu"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                {t.newBtn}
                <ChevronDown className="h-3.5 w-3.5 opacity-80" strokeWidth={1.5} />
              </button>
              {newMenuOpen && (
                <div className="projects-menu projects-menu-grouped absolute right-0 top-full z-20 mt-1 min-w-[11.5rem]">
                  <p className="projects-menu-label">{t.menuCreate}</p>
                  <button
                    onClick={() => runWithNotice(() => void handleCreateBlank())}
                    className="projects-menu-item"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t.blankProject}
                  </button>
                  <button
                    onClick={() => runWithNotice(() => void handleCreateSample())}
                    className="projects-menu-item"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {t.sampleProject}
                  </button>
                  {SHOW_PROJECTS_IMPORT ? (
                    <>
                      <div className="projects-menu-divider" role="separator" />
                      <p className="projects-menu-label">{t.menuImport}</p>
                      <button
                        onClick={() =>
                          runWithNotice(() => {
                            setNewMenuOpen(false);
                            zipInputRef.current?.click();
                          })
                        }
                        className="projects-menu-item"
                      >
                        <FileArchive className="h-3.5 w-3.5" />
                        {t.importZip}
                      </button>
                      <button
                        onClick={() =>
                          runWithNotice(() => {
                            setNewMenuOpen(false);
                            folderInputRef.current?.click();
                          })
                        }
                        className="projects-menu-item"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        {t.importFolder}
                      </button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="projects-desk soft-scrollbar flex-1 overflow-y-auto">
          <div className="projects-desk-inner">
            {!loading && filtered.length > 0 && (
              <div className="projects-desk-meta">
                <p className="projects-desk-eyebrow">{t.manuscriptDesk}</p>
                <p className="projects-desk-count">
                  {filtered.length} {filtered.length === 1 ? t.projectCountOne : t.projectCountMany}
                </p>
              </div>
            )}

          {loadError && (
            <div className="mb-4 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
            </div>
          )}
          {loading ? (
            <ProjectsListSkeleton className="flex-1 overflow-y-auto px-4 py-5 md:px-6" />
          ) : filtered.length === 0 ? (
            <EmptyProjects
              hasSearch={!!search.trim()}
              t={t}
              onSample={() => runWithNotice(() => void handleCreateSample())}
              onBlank={() => runWithNotice(() => void handleCreateBlank())}
              disabled={!!creatingLabel}
            />
          ) : view === "list" ? (
            <div className="projects-table-editorial">
              <div className="projects-table-head-editorial">
                <span className="projects-col-name">{t.colName}</span>
                <span className="projects-col-created hidden md:block">{t.colCreated}</span>
                <span className="projects-col-updated hidden md:block">{t.colUpdated}</span>
                <span className="projects-col-actions" aria-hidden="true" />
              </div>
              {filtered.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  deleting={deletingIds.has(project.id)}
                  onOpen={() => openEditor(project.id)}
                  onRename={(name) => handleRename(project.id, name)}
                  onDelete={() => handleDelete(project.id)}
                  onDefense={() => openDefense(project.id)}
                />
              ))}
            </div>
          ) : (
            <div className="projects-grid-editorial">
              {filtered.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => openEditor(project.id)}
                  disabled={deletingIds.has(project.id)}
                  className="projects-grid-card-editorial"
                >
                  <div className="icon-box">
                    <FileText className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <p className="mt-3 truncate font-serif-body text-sm font-semibold">{project.name}</p>
                  <p className="projects-row-date mt-1">
                    {t.created} {formatProjectDateTime(project.createdAt, locale)}
                  </p>
                  <p className="projects-row-date mt-0.5">
                    {t.updated} {formatProjectDateTime(project.updatedAt, locale)}
                  </p>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      </main>

      <ProjectFormatNoticeDialog
        open={formatNoticeOpen}
        onConfirm={confirmFormatNotice}
        onOpenChange={(next) => {
          if (!next) dismissFormatNotice();
        }}
      />
    </>
  );
}

function EmptyProjects({
  hasSearch,
  t,
  onSample,
  onBlank,
  disabled = false,
}: {
  hasSearch: boolean;
  t: ReturnType<typeof projectsCopy>;
  onSample: () => void;
  onBlank: () => void;
  disabled?: boolean;
}) {
  if (hasSearch) {
    return (
      <div className="projects-empty-editorial">
        <h2>{t.emptyNoMatches}</h2>
        <p className="projects-desk-count">{t.emptyTryDifferent}</p>
      </div>
    );
  }

  return (
    <div className="projects-empty-editorial">
      <h2>{t.emptyStartTitle}</h2>
      <p>{t.emptyStartBody}</p>

      <div className="projects-empty-actions">
        <button type="button" onClick={onBlank} disabled={disabled} className="projects-empty-card">
          <div className="icon-box">
            <FileText className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h3>{t.blankProject}</h3>
          <p>{t.emptyBlankHint}</p>
        </button>

        <button type="button" onClick={onSample} disabled={disabled} className="projects-empty-card">
          <div className="icon-box">
            <BookOpen className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h3>{t.sampleProject}</h3>
          <p>{t.emptySampleHint}</p>
        </button>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  deleting,
  onOpen,
  onRename,
  onDelete,
  onDefense,
}: {
  project: StoredProject;
  deleting: boolean;
  onOpen: () => void;
  onRename: (name: string) => void | Promise<void>;
  onDelete: () => void;
  onDefense: () => void;
}) {
  const { locale } = useLocale();
  const nameRef = useRef<EditableProjectNameHandle>(null);
  const [renaming, setRenaming] = useState(false);

  return (
    <div
      className={`projects-table-row-editorial${deleting ? " is-deleting" : ""}${renaming ? " is-renaming" : ""}`}
      onClick={(e) => {
        if (deleting || renaming) return;
        const target = e.target as HTMLElement;
        if (target.closest(".projects-col-actions")) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (deleting || renaming) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={deleting ? -1 : 0}
      aria-label={`Open ${project.name}`}
    >
      <div className="projects-col-name flex min-w-0 items-center gap-2">
        {deleting ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        )}
        <EditableProjectName
          ref={nameRef}
          name={project.name}
          disabled={deleting}
          variant="list"
          showFolderIcon={false}
          showEditButton={false}
          onRename={onRename}
          onEditingChange={setRenaming}
        />
      </div>
      <span
        className="projects-row-date projects-col-created hidden md:block"
        title={formatProjectDateTime(project.createdAt, locale)}
      >
        {formatTimeAgo(project.createdAt, locale)}
      </span>
      <span
        className="projects-row-date projects-col-updated hidden md:block"
        title={formatProjectDateTime(project.updatedAt, locale)}
      >
        {formatTimeAgo(project.updatedAt, locale)}
      </span>
      <div className="projects-col-actions flex justify-end gap-1">
        <button
          type="button"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDefense();
          }}
          className="projects-row-menu"
          aria-label="Phản biện"
          title="Chuẩn bị bảo vệ (Defense Mode)"
        >
          <GraduationCap className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            nameRef.current?.startEditing();
          }}
          className="projects-row-menu"
          aria-label="Rename project"
          title="Rename project (double-click name)"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="projects-row-menu text-destructive hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete project"
          title="Delete project"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
