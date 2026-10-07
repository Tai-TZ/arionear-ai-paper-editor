import { createFileRoute } from "@tanstack/react-router";
import { FeaturesPage } from "@/components/marketing/features-page";
import { featuresContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — Proofline" },
      { name: "description", content: featuresContent.lede },
    ],
  }),
  component: FeaturesPage,
});
