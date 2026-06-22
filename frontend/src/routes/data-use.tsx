import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";

export const Route = createFileRoute("/data-use")({
  head: () => ({
    meta: [{ title: "Data Use — Arionear" }],
  }),
  component: () => <MarketingPage slug="data-use" />,
});
