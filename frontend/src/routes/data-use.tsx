import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { dataUseContent } from "@/lib/marketing-content";

export const Route = createFileRoute("/data-use")({
  head: () => ({
    meta: [{ title: "Data Use — Arionear" }, { name: "description", content: dataUseContent.lede }],
  }),
  component: () => <MarketingPage content={dataUseContent} />,
});
