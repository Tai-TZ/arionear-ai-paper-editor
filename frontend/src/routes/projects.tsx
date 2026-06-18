import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { useEffect, useRef, useState } from "react";
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
    markEditorEntryTransition();
    navigate({ to: "/editor", search: { projectId } });
  };

  const handleCreateSample = async () => {
    setCreatingLabel("Creating sample project…");
    setNewMenuOpen(false);
    try {
      const project = await createPaper("Biomedical NER (Sample)", SAMPLE_LATEX);
      setProjects((prev) => [project, ...prev]);
      openEditor(project.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setCreatingLabel(null);
    }
  };

  const handleCreateBlank = async () => {
    setCreatingLabel("Creating blank project…");
    setNewMenuOpen(false);
    try {
      const project = await createPaper("New Project", BLANK_LATEX);
      setProjects((prev) => [project, ...prev]);
      openEditor(project.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to create project.");
    } finally {
      setCreatingLabel(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const texFile = files.find((f) => /\.(tex|latex)$/i.test(f.name));
    if (!texFile) return;

    setCreatingLabel("Uploading project…");
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
      setLoadError(error instanceof Error ? error.message : "Failed to upload project.");
    } finally {
      setCreatingLabel(null);
      e.target.value = "";
    }
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreatingLabel("Importing Overleaf ZIP…");
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
      setLoadError(error instanceof Error ? error.message : "ZIP import failed.");
    } finally {
      setCreatingLabel(null);
      e.target.value = "";
    }
  };

  const handleRename = async (id: string, name: string) => {
    const updated = await updatePaper(id, { name });
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
  };

  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await deletePaper(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to delete project.");
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
            <h1>Your Projects</h1>
          </div>

          <div className="projects-header-toolbar">
            <div className="projects-header-search">
              <Search strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                aria-label="Search projects"
              />
            </div>

            <div className="projects-view-toggle" role="group" aria-label="Project view">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`projects-view-btn ${view === "list" ? "is-active" : ""}`}
                aria-label="List view"
                aria-pressed={view === "list"}
              >
                <List className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => setView("grid")}
                className={`projects-view-btn ${view === "grid" ? "is-active" : ""}`}
                aria-label="Grid view"
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
                  Import
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={1.5} />
                </button>
                {importMenuOpen && (
                  <div className="projects-menu absolute right-0 top-full z-20 mt-1 min-w-[10rem]">
                    <button
                      onClick={() => zipInputRef.current?.click()}
                      className="projects-menu-item"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Overleaf ZIP
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="projects-menu-item"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload .tex + figures
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
                New
                <ChevronDown className="h-3.5 w-3.5 opacity-80" strokeWidth={1.5} />
              </button>
              {newMenuOpen && (
                <div className="projects-menu absolute right-0 top-full z-20 mt-1 min-w-[11rem]">
                  <button onClick={handleCreateBlank} className="projects-menu-item">
                    <FileText className="h-3.5 w-3.5" />
                    Blank project
                  </button>
                  <button onClick={handleCreateSample} className="projects-menu-item">
                    <Sparkles className="h-3.5 w-3.5" />
                    Sample project
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
                <p className="projects-desk-eyebrow">Manuscript desk</p>
                <p className="projects-desk-count">
                  {filtered.length} {filtered.length === 1 ? "project" : "projects"}
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
              <p className="mt-3 font-sans-ui text-xs uppercase tracking-widest">Loading your projects…</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyProjects
              hasSearch={!!search.trim()}
              onUpload={() => fileInputRef.current?.click()}
              onSample={handleCreateSample}
              onBlank={handleCreateBlank}
              disabled={!!creatingLabel}
            />
          ) : view === "list" ? (
            <div className="projects-table-editorial">
              <div className="projects-table-head-editorial">
                <span className="projects-col-name">Name</span>
                <span className="projects-col-created hidden md:block">Created</span>
                <span className="projects-col-updated hidden md:block">Last update</span>
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
                    Created {formatProjectDateTime(project.createdAt)}
                  </p>
                  <p className="projects-row-date mt-0.5">
                    Updated {formatProjectDateTime(project.updatedAt)}
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
  onUpload,
  onSample,
  onBlank,
  disabled = false,
}: {
  hasSearch: boolean;
  onUpload: () => void;
  onSample: () => void;
  onBlank: () => void;
  disabled?: boolean;
}) {
  if (hasSearch) {
    return (
      <div className="projects-empty-editorial">
        <h2>No matches</h2>
        <p className="projects-desk-count">Try a different search term.</p>
      </div>
    );
  }

  return (
    <div className="projects-empty-editorial">
      <h2>Start a LaTeX project</h2>
      <p>Upload your manuscript or explore Arionear with a ready-made sample.</p>

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
            Upload LaTeX
            {!SHOW_PROJECTS_UPLOAD && <span className="projects-coming-soon">Coming soon</span>}
          </h3>
          <p>
            {SHOW_PROJECTS_UPLOAD
              ? "Import a `.tex` file and figure assets together."
              : "Import a `.tex` file and figure assets together — available in a future release."}
          </p>
        </button>

        <button type="button" onClick={onSample} disabled={disabled} className="projects-empty-card">
          <div className="icon-box">
            <Sparkles className="h-5 w-5" strokeWidth={1.5} />
          </div>
          <h3>Sample project</h3>
          <p>Biomedical NER template with sections and preview ready to explore.</p>
        </button>
      </div>

      <button type="button" onClick={onBlank} disabled={disabled} className="projects-empty-blank">
        <FileText className="h-4 w-4" strokeWidth={1.5} />
        Blank project
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
  return (
    <div className={`projects-table-row-editorial${deleting ? " is-deleting" : ""}`}>
      <div className="projects-col-name flex min-w-0 items-center gap-2">
        {deleting ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        )}
        <button
          type="button"
          onClick={onOpen}
          disabled={deleting}
          className="projects-row-open min-w-0 flex-1 text-left"
        >
          <span className="projects-row-name block truncate">{project.name}</span>
        </button>
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
        <RenameProjectButton name={project.name} disabled={deleting} onRename={onRename} />
        <button
          type="button"
          disabled={deleting}
          onClick={onDelete}
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

function RenameProjectButton({
  name,
  disabled,
  onRename,
}: {
  name: string;
  disabled?: boolean;
  onRename: (name: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={async () => {
          const trimmed = draft.trim();
          setEditing(false);
          if (trimmed && trimmed !== name) await onRename(trimmed);
        }}
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const trimmed = draft.trim();
            setEditing(false);
            if (trimmed && trimmed !== name) await onRename(trimmed);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(name);
            setEditing(false);
          }
        }}
        className="h-8 min-w-[8rem] max-w-[12rem] rounded-md border border-border bg-background px-2 text-sm outline-none ring-primary/30 focus:ring-2"
        aria-label="Rename project"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="projects-row-menu"
      aria-label="Rename project"
      title="Rename project"
    >
      <Pencil className="h-4 w-4" />
    </button>
  );
}
