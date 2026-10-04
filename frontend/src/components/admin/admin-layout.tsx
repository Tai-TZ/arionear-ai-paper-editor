import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AdminSidebar, type AdminNavTab } from "@/components/admin/admin-sidebar";
import type { AuthUser } from "@/lib/auth-store";

type AdminLayoutProps = {
  activeTab: AdminNavTab;
  onTabChange: (tab: AdminNavTab) => void;
  user: AuthUser | null;
  onSignOut: () => void;
  children: ReactNode;
};

export function AdminLayout({
  activeTab,
  onTabChange,
  user,
  onSignOut,
  children,
}: AdminLayoutProps) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="admin-shell flex h-[100dvh] w-full overflow-hidden">
      {navOpen && (
        <button
          type="button"
          className="admin-drawer-scrim md:hidden"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      <AdminSidebar
        activeTab={activeTab}
        user={user}
        onTabChange={onTabChange}
        onSignOut={onSignOut}
        onNavigate={() => setNavOpen(false)}
        className={navOpen ? "admin-sidebar-open" : undefined}
      />

      <div className="admin-main-column flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="admin-mobile-strip md:hidden">
          <button
            type="button"
            className="admin-mobile-menu-btn"
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
          <Link to="/admin" className="admin-mobile-brand">
            Admin Console
          </Link>
        </div>

        {children}
      </div>
    </div>
  );
}
