import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms — Proofline" }],
  }),
  component: () => <MarketingPage slug="terms" />,
});
