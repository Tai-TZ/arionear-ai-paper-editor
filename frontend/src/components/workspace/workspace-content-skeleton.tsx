import { useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { commonCopy } from "@/lib/common-i18n";
import { projectsCopy } from "@/lib/projects-i18n";
import { cn } from "@/lib/utils";

function SkeletonLine({ className }: { className?: string }) {
  return <span className={cn("workspace-skeleton-line", className)} aria-hidden />;
}

function SkeletonStatus({ label }: { label: string }) {
  return (
    <p className="workspace-skeleton-status" role="status" aria-live="polite" aria-busy="true">
      <span className="workspace-skeleton-status-dot" aria-hidden />
      {label}
    </p>
  );
}

export function ProjectsListSkeleton({ className }: { className?: string }) {
  const { locale } = useLocale();
  const t = useMemo(() => projectsCopy(locale), [locale]);

  return (
    <div className={cn("workspace-content-skeleton projects-list-skeleton", className)}>
      <div className="projects-table-editorial" aria-hidden>
        <div className="projects-table-head-editorial">
          <span className="projects-col-name">
            <SkeletonLine className="w-20" />
          </span>
          <span className="projects-col-created hidden md:block">
            <SkeletonLine className="w-16" />
          </span>
          <span className="projects-col-updated hidden md:block">
            <SkeletonLine className="w-16" />
          </span>
          <span className="projects-col-actions" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="projects-skeleton-row">
            <SkeletonLine className="w-[min(100%,14rem)]" />
            <SkeletonLine className="hidden w-20 md:block" />
            <SkeletonLine className="hidden w-20 md:block" />
            <SkeletonLine className="w-8 shrink-0" />
          </div>
        ))}
      </div>
      <SkeletonStatus label={t.loading} />
    </div>
  );
}

export function ProfileContentSkeleton({ className }: { className?: string }) {
  const { locale } = useLocale();
  const label = useMemo(() => commonCopy(locale).shell.loading, [locale]);

  return (
    <div className={cn("workspace-content-skeleton profile-content-skeleton", className)}>
      <div className="profile-skeleton-scroll" aria-hidden>
        <SkeletonLine className="mb-6 w-[min(100%,22rem)]" />
        <div className="profile-skeleton-hero">
          <span className="profile-skeleton-avatar" />
          <div className="profile-skeleton-hero-copy space-y-2.5">
            <SkeletonLine className="w-40" />
            <SkeletonLine className="w-52" />
            <SkeletonLine className="w-28" />
          </div>
        </div>
        <div className="profile-skeleton-sections space-y-8">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="profile-skeleton-section">
              <SkeletonLine className="mb-4 w-32" />
              <div className="space-y-3">
                <SkeletonLine className="w-full" />
                <SkeletonLine className="w-[92%]" />
                <SkeletonLine className="w-[78%]" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <SkeletonStatus label={label} />
    </div>
  );
}

export function WorkspacePanelSkeleton({
  rows = 5,
  label,
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  const { locale } = useLocale();
  const fallback = useMemo(() => commonCopy(locale).shell.loading, [locale]);

  return (
    <div className={cn("workspace-content-skeleton workspace-panel-skeleton", className)}>
      <div className="workspace-panel-skeleton-rows" aria-hidden>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="workspace-panel-skeleton-row">
            <SkeletonLine className="w-[min(100%,12rem)]" />
            <SkeletonLine className="w-24" />
          </div>
        ))}
      </div>
      <SkeletonStatus label={label ?? fallback} />
    </div>
  );
}
