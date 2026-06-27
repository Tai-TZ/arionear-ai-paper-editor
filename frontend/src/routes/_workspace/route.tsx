import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const Route = createFileRoute("/_workspace")({
  ssr: false,
  beforeLoad: () => {
    requireAuth();
  },
  component: WorkspaceShell,
});
