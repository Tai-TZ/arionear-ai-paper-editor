import { createFileRoute } from "@tanstack/react-router";

import { TemplateGalleryContent } from "@/components/templates/template-gallery-content";

export const Route = createFileRoute("/templates/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "LaTeX Templates — Edico" },
      {
        name: "description",
        content: "Browse IEEE and academic LaTeX templates for Edico Paper IDE.",
      },
    ],
  }),
  component: TemplatesGalleryPage,
});

function TemplatesGalleryPage() {
  return <TemplateGalleryContent />;
}
