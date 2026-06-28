import { Link } from "@tanstack/react-router";
import { FolderOpen, Shield, UserCircle, BookOpen, Zap, LayoutTemplate } from "lucide-react";
import { useMemo } from "react";
import { useLocale } from "@/components/locale-provider";
import { WorkspaceSidebarFooter } from "@/components/workspace/workspace-sidebar-footer";
import { useWorkspaceBilling } from "@/components/workspace/workspace-context";
import { commonCopy } from "@/lib/common-i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFromName, type ResearcherProfile } from "@/lib/researcher-profile";
import type { AuthUser } from "@/lib/auth-store";
import { isAdminUser } from "@/lib/require-auth";
import type { UserTier } from "@/lib/api/billing-api";

export type WorkspaceNav = "projects" | "templates" | "profile" | "plan" | "guide" | "admin";

type WorkspaceSidebarLabels = {
  projects: string;
  templates?: string;
  profile: string;
  plan?: string;
  planFree?: string;
  planPro?: string;
  admin?: string;
  userGuide?: string;
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

function planLabel(tier: UserTier, labels: WorkspaceSidebarLabels) {
  return tier === "pro" ? (labels.planPro ?? "Pro") : (labels.planFree ?? "Free");
}

function ProfileCard({
  user,
  profile,
  active,
  tier,
  tierLoading,
  planNavLabel,
  tierLabel,
  onNavigate,
}: {
  user: AuthUser;
  profile?: ResearcherProfile | null;
  active: WorkspaceNav;
  tier: UserTier | null;
  tierLoading: boolean;
  planNavLabel: string;
  tierLabel: string;
  onNavigate?: () => void;
}) {
  const className = `workspace-profile-card${active === "profile" ? " is-active" : ""}`;
  const badgeText = tierLoading && !tier ? "…" : tier ? tierLabel : "…";

  const identity = (
    <div className="flex items-center gap-2.5">
      <Avatar className="h-9 w-9">
        {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={user.name} /> : null}
        <AvatarFallback className="avatar-fallback">{initialsFromName(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{profile?.name ?? user.name}</p>
        <p className="truncate font-mono-data text-[10px] tracking-wide text-muted-foreground">
          {user.email}
        </p>
      </div>
    </div>
  );

  const affiliation = (profile?.affiliation ?? user.affiliation) ? (
    <p className="mt-2 truncate font-sans-ui text-[10px] uppercase tracking-widest text-muted-foreground">
      {profile?.affiliation ?? user.affiliation}
    </p>
  ) : null;

  const planRow = (
    <Link
      to="/plan"
      className={`workspace-plan-row${tier === "pro" ? " is-pro" : ""}`}
      onClick={onNavigate}
      title={planNavLabel}
    >
      <span className="workspace-plan-row-label">{planNavLabel}</span>
      <span className="workspace-plan-badge">{badgeText}</span>
    </Link>
  );

  if (active === "profile") {
    return (
      <div className={className}>
        {identity}
        {planRow}
        {affiliation}
      </div>
    );
  }

  return (
    <div className={className}>
      <Link to="/profile" className="block" onClick={onNavigate}>
        {identity}
        {affiliation}
      </Link>
      {planRow}
    </div>
  );
}

function NavItem({
  active,
  current,
  to,
  icon: Icon,
  label,
  badge,
  className,
  onNavigate,
}: {
  active: boolean;
  current: boolean;
  to?: string;
  icon: typeof FolderOpen;
  label: string;
  badge?: string;
  className?: string;
  onNavigate?: () => void;
}) {
  const itemClass = `workspace-nav-item${className ? ` ${className}` : ""}${current ? " is-active" : ""}`;

  if (active) {
    return (
      <div className={itemClass} title={label}>
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        <span className="workspace-nav-label">{label}</span>
        {badge ? <span className="workspace-nav-tier is-pro">{badge}</span> : null}
      </div>
    );
  }

  return (
    <Link to={to!} className={itemClass} onClick={onNavigate} title={label}>
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
      <span className="workspace-nav-label">{label}</span>
      {badge ? <span className={`workspace-nav-tier${badge === "Pro" ? " is-pro" : ""}`}>{badge}</span> : null}
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
  const { billing, tierLoading } = useWorkspaceBilling();
  const tier = billing?.tier ?? null;
  const tierLabel = tier ? planLabel(tier, mergedLabels) : "";

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
          <ProfileCard
            user={user}
            profile={profile}
            active={active}
            tier={tier}
            tierLoading={tierLoading}
            planNavLabel={mergedLabels.plan ?? "Plan"}
            tierLabel={tierLabel}
            onNavigate={onNavigate}
          />
        ) : (
          <div className="workspace-profile-card text-xs text-muted-foreground">{mergedLabels.loadingAccount}</div>
        )}
      </div>

      <nav className="space-y-1 px-3">
        <NavItem
          active={active === "projects"}
          current={active === "projects"}
          to="/projects"
          icon={FolderOpen}
          label={mergedLabels.projects}
          onNavigate={onNavigate}
        />
        <NavItem
          active={active === "templates"}
          current={active === "templates"}
          to="/templates"
          icon={LayoutTemplate}
          label={mergedLabels.templates ?? "Templates"}
          onNavigate={onNavigate}
        />
        <NavItem
          active={active === "profile"}
          current={active === "profile"}
          to="/profile"
          icon={UserCircle}
          label={mergedLabels.profile}
          onNavigate={onNavigate}
        />
        <NavItem
          active={active === "plan"}
          current={active === "plan"}
          to="/plan"
          icon={Zap}
          label={mergedLabels.plan ?? "Plan"}
          badge={tier ? tierLabel : undefined}
          className="workspace-nav-item-plan"
          onNavigate={onNavigate}
        />

        {isAdminUser() ? (
          <NavItem
            active={active === "admin"}
            current={active === "admin"}
            to="/admin"
            icon={Shield}
            label={mergedLabels.admin ?? "Admin"}
            className="workspace-nav-item-admin"
            onNavigate={onNavigate}
          />
        ) : null}

        <NavItem
          active={active === "guide"}
          current={active === "guide"}
          to="/guide"
          icon={BookOpen}
          label={mergedLabels.userGuide ?? "User Guide"}
          className="workspace-nav-item-guide"
          onNavigate={onNavigate}
        />
      </nav>

      <WorkspaceSidebarFooter signOutLabel={mergedLabels.signOut} onSignOut={onSignOut} />
    </aside>
  );
}
