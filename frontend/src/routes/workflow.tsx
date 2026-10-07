import { createFileRoute } from "@tanstack/react-router";
import { WorkflowPage } from "@/components/marketing/workflow-page";
import { workflowContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/workflow")({
  head: () => ({
    meta: [{ title: "Workflow — Edico" }, { name: "description", content: workflowContent.lede }],
  }),
  component: WorkflowPage,
});
