import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { MarketingLayout } from "@/components/marketing/marketing-layout";
import { TemplatesLayoutProvider } from "@/components/templates/template-gallery-context";
import { WorkspaceBillingProvider } from "@/components/workspace/workspace-context";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { authToast } from "@/lib/auth-toast";
import { getSession, signOut, type AuthUser } from "@/lib/auth-store";
import { fetchResearcherProfile } from "@/lib/api/profile-api";
import type { ResearcherProfile } from "@/lib/researcher-profile";

export const Route = createFileRoute("/templates")({
  ssr: false,
  component: TemplatesRouteLayout,
});

function AuthenticatedTemplatesShell() {
  const navigate = useNavigate();
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
      active="templates"
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

function TemplatesRouteLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPdfViewer = pathname.endsWith("/pdf");
  const user = getSession();
  const variant = user ? "workspace" : "marketing";

  if (isPdfViewer) {
    return (
      <TemplatesLayoutProvider variant={variant}>
        <Outlet />
      </TemplatesLayoutProvider>
    );
  }

  if (variant === "workspace") {
    return (
      <TemplatesLayoutProvider variant={variant}>
        <WorkspaceBillingProvider>
          <AuthenticatedTemplatesShell />
        </WorkspaceBillingProvider>
      </TemplatesLayoutProvider>
    );
  }

  return (
    <TemplatesLayoutProvider variant={variant}>
      <MarketingLayout>
        <Outlet />
      </MarketingLayout>
    </TemplatesLayoutProvider>
  );
}
