import { Link } from "@tanstack/react-router";
import { FolderOpen, LogOut, UserCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFromName, type ResearcherProfile } from "@/lib/researcher-profile";
import type { AuthUser } from "@/lib/auth-store";

export type WorkspaceNav = "projects" | "profile";

type WorkspaceSidebarLabels = {
  projects: string;
  profile: string;
  signOut: string;
};

type WorkspaceSidebarProps = {
  active: WorkspaceNav;
  user: AuthUser | null;
  profile?: ResearcherProfile | null;
  labels?: WorkspaceSidebarLabels;
  onSignOut: () => void;
  onNavigate?: () => void;
  className?: string;
};

const DEFAULT_LABELS: WorkspaceSidebarLabels = {
  projects: "Your Projects",
  profile: "Researcher Profile",
  signOut: "Sign out",
};

function ProfileCard({
  user,
  profile,
  active,
  onNavigate,
}: {
  user: AuthUser;
  profile?: ResearcherProfile | null;
  active: WorkspaceNav;
  onNavigate?: () => void;
}) {
  const className = `workspace-profile-card${active === "profile" ? " is-active" : ""}`;

  const content = (
    <>
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9">
          {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={user.name} /> : null}
          <AvatarFallback className="avatar-fallback">
            {initialsFromName(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{profile?.name ?? user.name}</p>
          <p className="truncate font-mono-data text-[10px] tracking-wide text-muted-foreground">
            {user.email}
          </p>
        </div>
      </div>
      {(profile?.affiliation ?? user.affiliation) && (
        <p className="mt-2 truncate font-sans-ui text-[10px] uppercase tracking-widest text-muted-foreground">
          {profile?.affiliation ?? user.affiliation}
        </p>
      )}
    </>
  );

  if (active === "profile") {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link to="/profile" className={className} onClick={onNavigate}>
      {content}
    </Link>
  );
}

export function WorkspaceSidebar({
  active,
  user,
  profile,
  labels = DEFAULT_LABELS,
  onSignOut,
  onNavigate,
  className,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={`workspace-sidebar flex h-full w-56 shrink-0 flex-col lg:w-64${className ? ` ${className}` : ""}`}
    >
      <div className="workspace-topbar flex h-14 shrink-0 items-center px-4">
        <Link to="/" className="font-serif-display text-xl font-bold tracking-tight">
          Arionear
        </Link>
      </div>

      <div className="p-3">
        {user ? (
          <ProfileCard user={user} profile={profile} active={active} onNavigate={onNavigate} />
        ) : (
          <div className="workspace-profile-card text-xs text-muted-foreground">Loading account…</div>
        )}
      </div>

      <nav className="space-y-1 px-3">
        {active === "projects" ? (
          <div className="workspace-nav-item is-active">
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
            {labels.projects}
          </div>
        ) : (
          <Link to="/projects" className="workspace-nav-item" onClick={onNavigate}>
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
            {labels.projects}
          </Link>
        )}

        {active === "profile" ? (
          <div className="workspace-nav-item is-active">
            <UserCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
            {labels.profile}
          </div>
        ) : (
          <Link to="/profile" className="workspace-nav-item" onClick={onNavigate}>
            <UserCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
            {labels.profile}
          </Link>
        )}
      </nav>

      <div className="mt-auto border-t border-foreground p-3">
        <button type="button" onClick={onSignOut} className="workspace-signout">
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
          {labels.signOut}
        </button>
      </div>
    </aside>
  );
}
