import { Link } from "@tanstack/react-router";
import { Brain, Coins, FileStack, Gauge, LogOut, Shield, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initialsFromName } from "@/lib/researcher-profile";
import type { AuthUser } from "@/lib/auth-store";

export type AdminNavTab = "overview" | "users" | "cost" | "llm" | "templates";

type AdminSidebarProps = {
  activeTab: AdminNavTab;
  user: AuthUser | null;
  onTabChange: (tab: AdminNavTab) => void;
  onSignOut: () => void;
  onNavigate?: () => void;
  className?: string;
};

const NAV_ITEMS: { id: AdminNavTab; label: string; icon: typeof Gauge }[] = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "users", label: "Users & Quotas", icon: Users },
  { id: "cost", label: "Cost Report", icon: Coins },
  { id: "llm", label: "LLM Policy", icon: Brain },
  { id: "templates", label: "Templates", icon: FileStack },
];

function AdminIdentityCard({ user }: { user: AuthUser }) {
  return (
    <div className="admin-sidebar-identity">
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="admin-avatar-fallback">
            {initialsFromName(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate font-mono-data text-[10px] tracking-wide opacity-70">
            {user.email}
          </p>
        </div>
      </div>
      <span className="admin-sidebar-role-badge">
        <Shield className="h-3 w-3" strokeWidth={1.5} />
        God Admin
      </span>
    </div>
  );
}

export function AdminSidebar({
  activeTab,
  user,
  onTabChange,
  onSignOut,
  onNavigate,
  className,
}: AdminSidebarProps) {
  return (
    <aside className={`admin-sidebar flex h-full w-56 shrink-0 flex-col lg:w-60${className ? ` ${className}` : ""}`}>
      <div className="admin-sidebar-topbar flex shrink-0 flex-col justify-center px-4">
        <Link to="/" className="admin-brand">
          Arionear
        </Link>
        <p className="admin-eyebrow mt-1">Admin Console</p>
      </div>

      <div className="px-3 pt-3">
        {user ? (
          <AdminIdentityCard user={user} />
        ) : (
          <div className="admin-sidebar-identity text-xs opacity-70">Platform operator</div>
        )}
      </div>

      <nav className="admin-nav mt-2 px-3" aria-label="Admin navigation">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`admin-nav-item w-full text-left${activeTab === id ? " is-active" : ""}`}
            onClick={() => {
              onTabChange(id);
              onNavigate?.();
            }}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto border-t border-[color:var(--admin-sidebar-border)] p-3">
        <button type="button" onClick={onSignOut} className="admin-signout w-full">
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
