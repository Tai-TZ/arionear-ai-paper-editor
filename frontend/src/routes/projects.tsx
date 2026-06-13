import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Search,
  LayoutGrid,
  List,
  ChevronDown,
  Plus,
  Upload,
  FileText,
  MoreHorizontal,
  AlertTriangle,
  LogIn,
  FolderOpen,
  Sparkles,
  Trash2,
  LogOut,
  User,
} from "lucide-react";
import { getSession, logoutUser, type AuthUser } from "@/lib/auth-store";
import {
  BLANK_LATEX,
  SAMPLE_LATEX,
  addProjectAssets,
  createProject,
  deleteProject,
  formatTimeAgo,
  getProjects,
  inferProjectName,
  isImageAssetFile,
  readFileAsDataUrl,
  type StoredProject,
} from "@/lib/project-store";
import { markEditorEntryTransition } from "@/components/editor-entry-splash";

export const Route = createFileRoute("/projects")({
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
  const [projects, setProjects] = useState<StoredProject[]>(() => getProjects());
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(() => getSession());

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const openEditor = (projectId: string) => {
    markEditorEntryTransition();
    navigate({ to: "/editor", search: { projectId } });
  };

  const refresh = () => setProjects(getProjects());

  const handleCreateSample = () => {
    const project = createProject("Biomedical NER (Sample)", SAMPLE_LATEX);
    setNewMenuOpen(false);
    openEditor(project.id);
  };

  const handleCreateBlank = () => {
    const project = createProject("New Project", BLANK_LATEX);
    setNewMenuOpen(false);
    openEditor(project.id);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const texFile = files.find((f) => /\.(tex|latex)$/i.test(f.name));
    if (!texFile) return;

    const text = await texFile.text();
    const name = inferProjectName(text, texFile.name.replace(/\.(tex|latex)$/i, ""));
    const project = createProject(name, text);

    const imageFiles = files.filter((f) => isImageAssetFile(f.name));
    if (imageFiles.length) {
      const uploaded = await Promise.all(imageFiles.map(readFileAsDataUrl));
      addProjectAssets(project.id, uploaded);
    }

    refresh();
    openEditor(project.id);
    e.target.value = "";
    setImportMenuOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteProject(id);
    setMenuProjectId(null);
    refresh();
  };

  return (
    <div className="projects-shell flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        accept=".tex,.latex,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.eps"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      <aside className="projects-sidebar flex w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar lg:w-64">
        <div className="border-b border-border/50 px-4 py-4">
          <Link to="/" className="font-serif-display text-xl font-bold tracking-tight">
            Arionear
          </Link>
        </div>

        <div className="p-3">
          {user ? (
            <div className="rounded-xl border border-border/60 bg-card p-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                </div>
              </div>
              {user.affiliation && (
                <p className="mt-2 text-[11px] text-muted-foreground truncate">{user.affiliation}</p>
              )}
            </div>
          ) : (
            <div className="projects-guest-card rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/80 p-3.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-xs font-semibold text-amber-950">Don't lose access</p>
                  <p className="mt-1 text-[11px] leading-snug text-amber-900/80">
                    You are not logged in. Sign in to save projects and edit from other devices.
                  </p>
                </div>
              </div>
              <Link
                to="/signin"
                className="mt-3 flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Sign In or Sign Up
              </Link>
            </div>
          )}
        </div>

        <nav className="px-3">
          <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-medium">
            <FolderOpen className="h-4 w-4 text-primary" />
            Your Projects
          </div>
        </nav>

        <div className="mt-auto border-t border-border/50 p-3">
          {user ? (
            <button
              onClick={() => {
                logoutUser();
                setUser(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                to="/signin"
                className="flex items-center justify-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Link>
              <Link
                to="/signup"
                className="flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Create account
              </Link>
            </div>
          )}
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
                className="flex items-center gap-1 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs font-medium transition hover:bg-secondary"
              >
                Import
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {importMenuOpen && (
                <div className="projects-menu absolute right-0 top-full z-20 mt-1 min-w-[10rem]">
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
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
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

        <div className="soft-scrollbar flex-1 overflow-y-auto px-5 py-5 md:px-8">
          {filtered.length === 0 ? (
            <EmptyProjects
              hasSearch={!!search.trim()}
              onUpload={() => fileInputRef.current?.click()}
              onSample={handleCreateSample}
              onBlank={handleCreateBlank}
            />
          ) : view === "list" ? (
            <div className="projects-table rounded-xl border border-border/60 bg-card overflow-hidden">
              <div className="projects-table-head grid grid-cols-[1fr_8rem_2.5rem] gap-3 border-b border-border/50 px-4 py-2.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>Name</span>
                <span>Created</span>
                <span />
              </div>
              {filtered.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  menuOpen={menuProjectId === project.id}
                  onOpen={() => openEditor(project.id)}
                  onToggleMenu={() =>
                    setMenuProjectId((id) => (id === project.id ? null : project.id))
                  }
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
                  className="projects-grid-card text-left"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <p className="mt-3 text-sm font-medium truncate">{project.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTimeAgo(project.createdAt)}
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
}: {
  hasSearch: boolean;
  onUpload: () => void;
  onSample: () => void;
  onBlank: () => void;
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
        <button onClick={onUpload} className="projects-action-card group">
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

        <button onClick={onSample} className="projects-action-card group">
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
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
      >
        <FileText className="h-4 w-4" />
        Or start with a blank project
      </button>
    </div>
  );
}

function ProjectRow({
  project,
  menuOpen,
  onOpen,
  onToggleMenu,
  onDelete,
}: {
  project: StoredProject;
  menuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="projects-table-row grid grid-cols-[1fr_8rem_2.5rem] gap-3 items-center px-4 py-3 border-b border-border/40 last:border-b-0">
      <button
        onClick={onOpen}
        className="flex min-w-0 items-center gap-3 text-left transition hover:text-primary"
      >
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{project.name}</span>
      </button>
      <span className="text-xs text-muted-foreground">{formatTimeAgo(project.createdAt)}</span>
      <div className="relative flex justify-end">
        <button
          onClick={onToggleMenu}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label="Project options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="projects-menu absolute right-0 top-full z-20 mt-1 min-w-[8rem]">
            <button onClick={onOpen} className="projects-menu-item">
              Open
            </button>
            <button
              onClick={onDelete}
              className="projects-menu-item text-[color:var(--editorial-red)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
