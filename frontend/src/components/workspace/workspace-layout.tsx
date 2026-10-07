import { ProoflineWordmark } from "@/components/proofline-wordmark";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { WorkspaceSidebar, type WorkspaceNav } from "@/components/workspace/workspace-sidebar";
import type { AuthUser } from "@/lib/auth-store";
import type { ResearcherProfile } from "@/lib/researcher-profile";

/** Set false to hide import options inside the + New menu. */
export const SHOW_PROJECTS_IMPORT = true;

/** Set false to hide import/upload controls in the editor sidebar. */
export const SHOW_EDITOR_IMPORT = true;

type WorkspaceLayoutProps = {
  active: WorkspaceNav;
  user: AuthUser | null;
  profile?: ResearcherProfile | null;
  labels?: {
    projects: string;
    profile: string;
    signOut: string;
  };
  onSignOut: () => void;
  children: ReactNode;
};

export function WorkspaceLayout({
  active,
  user,
  profile,
  labels,
  onSignOut,
  children,
}: WorkspaceLayoutProps) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [active]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="workspace-shell workspace-shell-root flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {navOpen && (
        <button
          type="button"
          className="workspace-drawer-scrim md:hidden"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      <WorkspaceSidebar
        active={active}
        user={user}
        profile={profile}
        labels={labels}
        onSignOut={onSignOut}
        onNavigate={() => setNavOpen(false)}
        className={navOpen ? "workspace-sidebar-open" : undefined}
      />

      <div className="workspace-main-column flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="workspace-mobile-strip md:hidden">
          <button
            type="button"
            className="workspace-mobile-menu-btn"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? (
              <X className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <Menu className="h-4 w-4" strokeWidth={1.5} />
            )}
          </button>
          <Link to="/" className="workspace-mobile-brand">
            <ProoflineWordmark />
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}
