import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MarketingColophon, MarketingMasthead } from "@/components/marketing/marketing-layout";

export function TemplateGalleryShell({ children }: { children: ReactNode }) {
  return (
    <div className="template-gallery-page min-h-screen bg-[#f7f8fa] text-foreground dark:bg-background">
      <MarketingMasthead />
      <main className="template-gallery-main mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
      <MarketingColophon />
    </div>
  );
}

export function TemplateBackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="template-back-link mb-6 inline-flex items-center text-sm text-[#4b6cb7] hover:underline">
      ← {label}
    </Link>
  );
}

export function TemplateOfficialBadge({ label }: { label: string }) {
  return (
    <span className="template-official-badge ml-2 inline-flex rounded bg-[#4b6cb7] px-2 py-0.5 text-[11px] font-semibold text-white">
      {label}
    </span>
  );
}

export function TemplateTagList({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded border border-border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
