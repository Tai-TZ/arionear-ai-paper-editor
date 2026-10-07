import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy — Edico" }],
  }),
  component: () => <MarketingPage slug="privacy" />,
});
