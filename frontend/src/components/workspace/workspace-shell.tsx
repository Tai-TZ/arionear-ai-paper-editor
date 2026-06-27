import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WorkspaceBillingProvider } from "@/components/workspace/workspace-context";
import { type WorkspaceNav } from "@/components/workspace/workspace-sidebar";
import { getSession, signOut, type AuthUser } from "@/lib/auth-store";
import { authToast } from "@/lib/auth-toast";
import { fetchResearcherProfile } from "@/lib/api/profile-api";
import type { ResearcherProfile } from "@/lib/researcher-profile";

function workspaceNavFromPath(pathname: string): WorkspaceNav {
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/plan")) return "plan";
  if (pathname.startsWith("/guide")) return "guide";
  return "projects";
}

function WorkspaceShellInner() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = useMemo(() => workspaceNavFromPath(pathname), [pathname]);
  const [user, setUser] = useState<AuthUser | null>(() => getSession());
  const [profile, setProfile] = useState<ResearcherProfile | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetchResearcherProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <WorkspaceLayout
      active={active}
      user={user}
      profile={profile}
      onSignOut={() => {
        signOut();
        setUser(null);
        authToast.signOutSuccess();
        navigate({ to: "/signin" });
      }}
    >
      <Outlet />
    </WorkspaceLayout>
  );
}

export function WorkspaceShell() {
  return (
    <WorkspaceBillingProvider>
      <WorkspaceShellInner />
    </WorkspaceBillingProvider>
  );
}
