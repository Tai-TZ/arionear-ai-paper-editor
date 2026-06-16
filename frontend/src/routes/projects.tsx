import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  MoreHorizontal,
  FolderOpen,
  Sparkles,
  Trash2,
  LogOut,
  User,
  Loader2,
  UserCircle,
} from "lucide-react";
import { getSession, refreshSession, signOut, type AuthUser } from "@/lib/auth-store";
import { authToast } from "@/lib/auth-toast";
import {
  createPaper,
  deletePaper,
  fetchPapers,
  addPaperAssets,
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
import { initialsFromName, type ResearcherProfile } from "@/lib/researcher-profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/projects")({
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
    <div className="projects-shell flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
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

      <aside className="projects-sidebar flex h-full w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar lg:w-64">
        <div className="border-b border-border/50 px-4 py-4">
          <Link to="/" className="font-serif-display text-xl font-bold tracking-tight">
            Arionear
          </Link>
        </div>

        <div className="p-3">
          {user ? (
            <Link
              to="/profile"
              className="block rounded-xl border border-border/60 bg-card p-3.5 transition hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt={user.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initialsFromName(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                </div>
              </div>
              {(profile?.affiliation ?? user.affiliation) && (
                <p className="mt-2 truncate text-[11px] text-muted-foreground">
                  {profile?.affiliation ?? user.affiliation}
                </p>
              )}
            </Link>
          ) : (
            <div className="rounded-xl border border-border/60 bg-card p-3.5 text-xs text-muted-foreground">
              Loading account…
            </div>
          )}
        </div>

        <nav className="space-y-1 px-3">
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-medium">
            <FolderOpen className="h-4 w-4 text-primary" />
            Your Projects
          </div>
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <UserCircle className="h-4 w-4" />
            Researcher Profile
          </Link>
        </nav>

        <div className="mt-auto border-t border-border/50 p-3">
          <button
            onClick={() => {
              signOut();
              setUser(null);
              authToast.signOutSuccess();
              navigate({ to: "/signin" });
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-4 md:px-8">
          <h1 className="text-lg font-semibold tracking-tight">Your Projects</h1>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="h-8 w-44 rounded-lg border border-border/60 bg-card pl-8 pr-3 text-xs outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 md:w-52"
              />
            </div>

            <div className="flex rounded-lg border border-border/60 p-0.5">
              <button
                onClick={() => setView("list")}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setView("grid")}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition ${view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => {
                  setImportMenuOpen((v) => !v);
                  setNewMenuOpen(false);
                }}
                disabled={!!creatingLabel}
                className="flex items-center gap-1 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-secondary disabled:opacity-50"
              >
                Import
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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

            <div className="relative">
              <button
                onClick={() => {
                  setNewMenuOpen((v) => !v);
                  setImportMenuOpen(false);
                }}
                disabled={!!creatingLabel}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                New
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
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

        <div className="soft-scrollbar flex-1 overflow-y-auto px-5 py-5 pb-8 md:px-8">
          {loadError && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loadError}
            </div>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="mt-3 text-sm">Loading your projects…</p>
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
            <div className="projects-table rounded-xl border border-border/60 bg-card">
              <div className="projects-table-head grid grid-cols-[1fr_9rem_9rem_2.5rem] gap-3 border-b border-border/50 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>Name</span>
                <span>Created</span>
                <span>Last update</span>
                <span />
              </div>
              {filtered.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  deleting={deletingIds.has(project.id)}
                  onOpen={() => openEditor(project.id)}
                  onDelete={() => handleDelete(project.id)}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((project) => (
                <button
                  key={project.id}
                  onClick={() => openEditor(project.id)}
                  disabled={deletingIds.has(project.id)}
                  className="projects-grid-card text-left disabled:pointer-events-none disabled:opacity-40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <p className="mt-3 text-sm font-medium truncate">{project.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatProjectDateTime(project.createdAt)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    Updated {formatProjectDateTime(project.updatedAt)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
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
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-muted-foreground">No projects match your search.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">Start a LaTeX project</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload your manuscript or explore Arionear with a ready-made sample.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <button onClick={onUpload} disabled={disabled} className="projects-action-card group disabled:opacity-60">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 transition group-hover:bg-primary/15">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-4 text-left">
            <p className="text-sm font-semibold">Upload LaTeX file</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Import a `.tex` file and any figure files (`.png`, `.pdf`, `.eps`, …) together.
            </p>
          </div>
        </button>

        <button onClick={onSample} disabled={disabled} className="projects-action-card group disabled:opacity-60">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 transition group-hover:bg-amber-200/80">
            <Sparkles className="h-5 w-5 text-amber-700" />
          </div>
          <div className="mt-4 text-left">
            <p className="text-sm font-semibold">Sample project</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Open a biomedical NER paper template with abstract, sections, and preview ready to explore.
            </p>
          </div>
        </button>
      </div>

      <button
        onClick={onBlank}
        disabled={disabled}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-60"
      >
        <FileText className="h-4 w-4" />
        Or start with a blank project
      </button>
    </div>
  );
}

function ProjectRow({
  project,
  deleting,
  onOpen,
  onDelete,
}: {
  project: StoredProject;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`projects-table-row grid grid-cols-[1fr_9rem_9rem_2.5rem] gap-3 items-center px-4 py-3 border-b border-border/40 last:border-b-0 ${
        deleting ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <button
        onClick={onOpen}
        disabled={deleting}
        className="flex min-w-0 items-center gap-3 text-left transition hover:text-primary disabled:cursor-not-allowed"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-sm font-medium">{project.name}</span>
      </button>
      <span className="text-xs text-muted-foreground" title={formatProjectDateTime(project.createdAt)}>
        {formatTimeAgo(project.createdAt)}
      </span>
      <span className="text-xs text-muted-foreground" title={formatProjectDateTime(project.updatedAt)}>
        {formatTimeAgo(project.updatedAt)}
      </span>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={deleting}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground disabled:opacity-50"
              aria-label="Project options"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={6}
            collisionPadding={{ top: 8, bottom: 8, left: 8, right: 56 }}
            className="min-w-[10rem]"
          >
            <DropdownMenuItem onClick={onOpen}>
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              Open
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
