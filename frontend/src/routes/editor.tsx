import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { EditorWorkspace } from "@/features/editor/EditorWorkspace";

export type EditorSearch = {
  projectId?: string;
};

export const Route = createFileRoute("/editor")({
  ssr: false,
  beforeLoad: () => {
    requireAuth();
  },
  validateSearch: (search: Record<string, unknown>): EditorSearch => {
    const raw = search.projectId;
    const projectId = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
    return { projectId };
  },
  head: () => ({
    meta: [
      { title: "Arionear - AI LaTeX Editor" },
      {
        name: "description",
        content: "Upload LaTeX manuscripts and refine them with an AI LaTeX editor.",
      },
    ],
  }),
  component: EditorWorkspace,
});
