import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Plus,
  Upload,
  FileText,
  Pencil,
  FolderOpen,
  Sparkles,
  Trash2,
  Loader2,
} from "lucide-react";
import { getSession, refreshSession, signOut, type AuthUser } from "@/lib/auth-store";
import { authToast } from "@/lib/auth-toast";
import {
  SHOW_PROJECTS_IMPORT,
  SHOW_PROJECTS_UPLOAD,
  WorkspaceLayout,
} from "@/components/workspace/workspace-layout";
import {
  createPaper,
  deletePaper,
  fetchPapers,
  addPaperAssets,
  updatePaper,
} from "@/lib/api/papers-api";
import {
  BLANK_LATEX,
  SAMPLE_LATEX,
  formatTimeAgo,
  formatProjectDateTime,
  inferProjectName,
  isImageAssetFile,
  readFileAsDataUrl,
  type StoredProject,
} from "@/lib/project-store";
import { importOverleafZip } from "@/lib/overleaf-import";
import { markEditorEntryTransition } from "@/components/editor-entry-splash";
import { fetchResearcherProfile } from "@/lib/api/profile-api";
import { type ResearcherProfile } from "@/lib/researcher-profile";
import { useLocale } from "@/components/locale-provider";
import { projectsCopy } from "@/lib/projects-i18n";
import {
  EditableProjectName,
  type EditableProjectNameHandle,
} from "@/components/editable-project-name";
import { toast } from "sonner";

export const Route = createFileRoute("/projects")({
  ssr: false,
  beforeLoad: () => {
    requireAuth();
  },
  head: () => ({
    meta: [
      { title: "Your Projects — Arionear" },
      {
        name: "description",
        content: "Upload LaTeX manuscripts or start from a sample project before opening the editor.",
      },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => projectsCopy(locale), [locale]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingLabel, setCreatingLabel] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(() => getSession());
  const [profile, setProfile] = useState<ResearcherProfile | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setLoadError(null);

      const cached = getSession();
      if (cached && !cancelled) setUser(cached);

      try {
        const [sessionUser, list, researcherProfile] = await Promise.all([
          refreshSession(),
          fetchPapers(),
          fetchResearcherProfile().catch(() => null),
        ]);
        if (cancelled) return;
        if (sessionUser) setUser(sessionUser);
        if (researcherProfile) setProfile(researcherProfile);
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

  const openEditor = (projectId: string) => {
    if (!projectId.trim()) return;
    markEditorEntryTransition();
    void navigate({
      to: "/editor",
      search: { projectId: projectId.trim() },
    });
  };

  const handleCreateSample = async () => {
    setCreatingLabel(t.creatingSample);
    setNewMenuOpen(false);
    try {
      const project = await createPaper("Biomedical NER (Sample)", SAMPLE_LATEX);
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
      const project = await createPaper("New Project", BLANK_LATEX);
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
    if (!files.length) return;

    const texFile = files.find((f) => /\.(tex|latex)$/i.test(f.name));
    if (!texFile) return;

    setCreatingLabel(t.uploading);
    setImportMenuOpen(false);
    try {
      const text = await texFile.text();
      const name = inferProjectName(text, texFile.name.replace(/\.(tex|latex)$/i, ""));
      let project = await createPaper(name, text);

      const imageFiles = files.filter((f) => isImageAssetFile(f.name));
      if (imageFiles.length) {
        const uploaded = await Promise.all(imageFiles.map(readFileAsDataUrl));
        project = await addPaperAssets(project.id, uploaded);
      }

      setProjects((prev) => [project, ...prev]);
      openEditor(project.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.errorUpload);
    } finally {
      setCreatingLabel(null);
      e.target.value = "";
    }
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreatingLabel(t.importingZip);
    setImportMenuOpen(false);
    try {
      const imported = await importOverleafZip(file);
      const mainContent =
        imported.files.find((f) => f.path === imported.mainFile)?.content ?? "";
      let project = await createPaper(imported.name, mainContent, {
        files: imported.files,
        mainFile: imported.mainFile,
        compiler: imported.compiler,
        assets: imported.assets,
      });
      if (imported.assets.length) {
        project = await addPaperAssets(project.id, imported.assets);
      }
      setProjects((prev) => [project, ...prev]);
      openEditor(project.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t.errorImport);
    } finally {
      setCreatingLabel(null);
      e.target.value = "";
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
    <WorkspaceLayout
      active="projects"
      user={user}
      profile={profile}
      onSignOut={() => {
        signOut();
        setUser(null);
        authToast.signOutSuccess();
        navigate({ to: "/signin" });
      }}
    >
      {creatingLabel && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">{creatingLabel}</p>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".tex,.latex,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.eps"
        multiple
        className="hidden"
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

            {SHOW_PROJECTS_IMPORT && (
              <span className="projects-header-divider" aria-hidden="true" />
            )}

            {SHOW_PROJECTS_IMPORT && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setImportMenuOpen((v) => !v);
                    setNewMenuOpen(false);
                  }}
                  disabled={!!creatingLabel}
                  className="projects-header-btn"
                >
                  {t.importBtn}
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={1.5} />
                </button>
                {importMenuOpen && (
                  <div className="projects-menu absolute right-0 top-full z-20 mt-1 min-w-[10rem]">
                    <button
                      onClick={() => zipInputRef.current?.click()}
                      className="projects-menu-item"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {t.importZip}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="projects-menu-item"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {t.importTexFigures}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="projects-header-new relative">
              <button
                type="button"
                onClick={() => {
                  setNewMenuOpen((v) => !v);
                  setImportMenuOpen(false);
                }}
                disabled={!!creatingLabel}
                className="projects-header-btn projects-header-btn-primary"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                {t.newBtn}
                <ChevronDown className="h-3.5 w-3.5 opacity-80" strokeWidth={1.5} />
              </button>
              {newMenuOpen && (
                <div className="projects-menu absolute right-0 top-full z-20 mt-1 min-w-[11rem]">
                  <button onClick={handleCreateBlank} className="projects-menu-item">
                    <FileText className="h-3.5 w-3.5" />
                    {t.blankProject}
                  </button>
                  <button onClick={handleCreateSample} className="projects-menu-item">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t.sampleProject}
                  </button>
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
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="mt-3 font-sans-ui text-xs uppercase tracking-widest">{t.loading}</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyProjects
              hasSearch={!!search.trim()}
              t={t}
              onUpload={() => fileInputRef.current?.click()}
              onSample={handleCreateSample}
              onBlank={handleCreateBlank}
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
                    {t.created} {formatProjectDateTime(project.createdAt)}
                  </p>
                  <p className="projects-row-date mt-0.5">
                    {t.updated} {formatProjectDateTime(project.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
      </main>
    </WorkspaceLayout>
  );
}

function EmptyProjects({
  hasSearch,
  t,
  onUpload,
  onSample,
  onBlank,
  disabled = false,
}: {
  hasSearch: boolean;
  t: ReturnType<typeof projectsCopy>;
  onUpload: () => void;
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
        <button
          type="button"
          onClick={onUpload}
          disabled={disabled || !SHOW_PROJECTS_UPLOAD}
          className="projects-empty-card"
          aria-disabled={!SHOW_PROJECTS_UPLOAD || disabled}
        >
          <div className="icon-box">
            <Upload className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h3>
            {t.emptyUpload}
            {!SHOW_PROJECTS_UPLOAD && <span className="projects-coming-soon">{t.emptyComingSoon}</span>}
          </h3>
          <p>
            {SHOW_PROJECTS_UPLOAD
              ? t.emptyUploadHint
              : t.emptyUploadHintSoon}
          </p>
        </button>

        <button type="button" onClick={onSample} disabled={disabled} className="projects-empty-card">
          <div className="icon-box">
            <Sparkles className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h3>{t.sampleProject}</h3>
          <p>{t.emptySampleHint}</p>
        </button>
      </div>

      <button type="button" onClick={onBlank} disabled={disabled} className="projects-empty-blank">
        <FileText className="h-4 w-4" strokeWidth={1.5} />
        {t.blankProject}
      </button>
    </div>
  );
}

function ProjectRow({
  project,
  deleting,
  onOpen,
  onRename,
  onDelete,
}: {
  project: StoredProject;
  deleting: boolean;
  onOpen: () => void;
  onRename: (name: string) => void | Promise<void>;
  onDelete: () => void;
}) {
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
        title={formatProjectDateTime(project.createdAt)}
      >
        {formatTimeAgo(project.createdAt)}
      </span>
      <span
        className="projects-row-date projects-col-updated hidden md:block"
        title={formatProjectDateTime(project.updatedAt)}
      >
        {formatTimeAgo(project.updatedAt)}
      </span>
      <div className="projects-col-actions flex justify-end gap-1">
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
