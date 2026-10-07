import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const Route = createFileRoute("/integrity")({
  head: () => ({
    meta: [{ title: "Integrity — Edico" }],
  }),
  component: () => <MarketingPage slug="integrity" />,
});
