import { useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { commonCopy } from "@/lib/common-i18n";
import { cn } from "@/lib/utils";

type AppLoadingScreenProps = {
  label?: string;
  detail?: string;
  eyebrow?: string;
  variant?: "fullscreen" | "inline" | "overlay";
  exiting?: boolean;
  className?: string;
};

function AppLoadingCard({
  label,
  detail,
  eyebrow,
  subline,
  compact = false,
}: {
  label: string;
  detail?: string;
  eyebrow: string;
  subline: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "app-loading-card border border-foreground bg-background",
        compact ? "app-loading-card--compact" : "app-loading-card--full",
      )}
    >
      <div className="app-loading-card-chrome">
        <span className="app-loading-live-dot" aria-hidden />
        <span>{eyebrow}</span>
      </div>
      <div className="app-loading-card-main">
        <p className="app-loading-card-label">{label}</p>
        {detail ? <p className="app-loading-card-detail">{detail}</p> : null}
        <div className="app-loading-progress-track" role="presentation" aria-hidden>
          <div className="app-loading-progress-fill" />
        </div>
        <p className="app-loading-card-subline">{subline}</p>
      </div>
    </div>
  );
}

export function AppLoadingScreen({
  label,
  detail,
  eyebrow,
  variant = "inline",
  exiting = false,
  className,
}: AppLoadingScreenProps) {
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale).shell, [locale]);
  const text = label ?? t.loading;
  const tag = eyebrow ?? t.loadingEyebrow;

  if (variant === "fullscreen" || variant === "overlay") {
    return (
      <div
        className={cn(
          "app-loading-screen",
          variant === "fullscreen" && "app-loading-screen--fullscreen newsprint-texture",
          variant === "overlay" && "app-loading-screen--overlay newsprint-texture",
          exiting && "app-loading-screen--exit",
          className,
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={text}
      >
        {variant === "fullscreen" ? (
          <header className="app-loading-masthead">
            <span className="app-loading-brand">Arionear</span>
            <span className="app-loading-masthead-meta">{t.loadingMasthead}</span>
          </header>
        ) : null}

        <div className="app-loading-body">
          <AppLoadingCard label={text} detail={detail} eyebrow={tag} subline={t.loadingSubline} />
        </div>

        {variant === "fullscreen" ? (
          <footer className="app-loading-footer">{t.loadingFooter}</footer>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn("app-loading-screen app-loading-screen--inline", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={text}
    >
      <AppLoadingCard
        label={text}
        detail={detail}
        eyebrow={tag}
        subline={t.loadingSubline}
        compact
      />
    </div>
  );
}

export function AppRoutePending() {
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale).shell, [locale]);
  return <AppLoadingScreen label={t.loadingRoute} variant="fullscreen" />;
}
