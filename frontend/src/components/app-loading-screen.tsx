import { useMemo } from "react";

import { EdicoWordmark } from "@/components/edico-wordmark";
import { useLocale } from "@/components/locale-context";
import { commonCopy } from "@/lib/common-i18n";
import type { UiLanguage } from "@/lib/researcher-profile";
import { cn } from "@/lib/utils";

type AppLoadingScreenProps = {
  label?: string;
  detail?: string;
  eyebrow?: string;
  variant?: "fullscreen" | "inline" | "overlay";
  exiting?: boolean;
  className?: string;
  /** Bypass LocaleProvider — used during shell bootstrap. */
  locale?: UiLanguage;
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

export function AppLoadingScreenInner({
  label,
  detail,
  eyebrow,
  variant = "inline",
  exiting = false,
  className,
  locale,
}: AppLoadingScreenProps & { locale: UiLanguage }) {
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
        aria-busy={!exiting}
        aria-label={text}
      >
        {variant === "fullscreen" ? (
          <header className="app-loading-masthead">
            <span className="app-loading-brand">
              <EdicoWordmark />
            </span>
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
      aria-busy={!exiting}
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

export function AppLoadingScreen({
  label,
  detail,
  eyebrow,
  variant = "inline",
  exiting = false,
  className,
  locale: localeProp,
}: AppLoadingScreenProps) {
  const { locale: contextLocale } = useLocale();
  return (
    <AppLoadingScreenInner
      locale={localeProp ?? contextLocale}
      label={label}
      detail={detail}
      eyebrow={eyebrow}
      variant={variant}
      exiting={exiting}
      className={className}
    />
  );
}
