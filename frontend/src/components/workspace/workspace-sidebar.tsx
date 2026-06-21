import { Link } from "@tanstack/react-router";
import { FolderOpen, Shield, UserCircle } from "lucide-react";
import { useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import { WorkspaceSidebarFooter } from "@/components/workspace/workspace-sidebar-footer";
import { commonCopy } from "@/lib/common-i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFromName, type ResearcherProfile } from "@/lib/researcher-profile";
import type { AuthUser } from "@/lib/auth-store";
import { isAdminUser } from "@/lib/require-auth";

export type WorkspaceNav = "projects" | "profile" | "admin";

type WorkspaceSidebarLabels = {
  projects: string;
  profile: string;
  admin?: string;
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
  labels,
  onSignOut,
  onNavigate,
  className,
}: WorkspaceSidebarProps) {
  const { locale } = useLocale();
  const i18nLabels = useMemo(() => commonCopy(locale).workspace, [locale]);
  const mergedLabels = { ...i18nLabels, ...labels };

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
          <div className="workspace-profile-card text-xs text-muted-foreground">{mergedLabels.loadingAccount}</div>
        )}
      </div>

      <nav className="space-y-1 px-3">
        {active === "projects" ? (
          <div className="workspace-nav-item is-active" title={mergedLabels.projects}>
            <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="workspace-nav-label">{mergedLabels.projects}</span>
          </div>
        ) : (
          <Link to="/projects" className="workspace-nav-item" onClick={onNavigate} title={mergedLabels.projects}>
            <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="workspace-nav-label">{mergedLabels.projects}</span>
          </Link>
        )}

        {active === "profile" ? (
          <div className="workspace-nav-item is-active" title={mergedLabels.profile}>
            <UserCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="workspace-nav-label">{mergedLabels.profile}</span>
          </div>
        ) : (
          <Link to="/profile" className="workspace-nav-item" onClick={onNavigate} title={mergedLabels.profile}>
            <UserCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="workspace-nav-label">{mergedLabels.profile}</span>
          </Link>
        )}

        {isAdminUser() ? (
          active === "admin" ? (
            <div className="workspace-nav-item is-active workspace-nav-item-admin" title={mergedLabels.admin ?? "Admin"}>
              <Shield className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="workspace-nav-label">{mergedLabels.admin ?? "Admin"}</span>
            </div>
          ) : (
            <Link
              to="/admin"
              className="workspace-nav-item workspace-nav-item-admin"
              onClick={onNavigate}
              title={mergedLabels.admin ?? "Admin"}
            >
              <Shield className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              <span className="workspace-nav-label">{mergedLabels.admin ?? "Admin"}</span>
            </Link>
          )
        ) : null}
      </nav>

      <WorkspaceSidebarFooter signOutLabel={mergedLabels.signOut} onSignOut={onSignOut} />
    </aside>
  );
}
