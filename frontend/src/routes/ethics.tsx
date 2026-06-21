import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const Route = createFileRoute("/ethics")({
  head: () => ({
    meta: [{ title: "Ethics — Arionear" }],
  }),
  component: () => <MarketingPage slug="ethics" />,
});
