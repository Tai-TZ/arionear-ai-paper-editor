import { useMemo } from "react";

import { useLocale } from "@/components/locale-provider";
import { commonCopy } from "@/lib/common-i18n";
import { cn } from "@/lib/utils";
import arioAvatar from "../../assets/avatar/avatar-chat.png";

type AppLoadingScreenProps = {
  label?: string;
  variant?: "fullscreen" | "inline" | "overlay";
  exiting?: boolean;
  className?: string;
};

export function AppLoadingScreen({
  label,
  variant = "inline",
  exiting = false,
  className,
}: AppLoadingScreenProps) {
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale).shell, [locale]);
  const text = label ?? t.loading;

  return (
    <div
      className={cn(
        "app-loading-screen editor-entry-splash",
        variant === "inline" && "app-loading-screen--inline",
        variant === "overlay" && "app-loading-screen--overlay",
        exiting && "editor-entry-splash-exit",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={text}
    >
      <div className="editor-entry-splash-inner">
        <div className="editor-entry-splash-icon-wrap">
          <div className="editor-entry-splash-icon-glow" aria-hidden />
          <img src={arioAvatar} alt="" className="editor-entry-splash-icon" />
        </div>
        <div className="editor-entry-splash-bar" aria-hidden>
          <div className="editor-entry-splash-bar-fill" />
        </div>
        <p className="editor-entry-splash-label">{text}</p>
      </div>
    </div>
  );
}

export function AppRoutePending() {
  const { locale } = useLocale();
  const label = useMemo(() => commonCopy(locale).shell.loadingRoute, [locale]);
  return <AppLoadingScreen label={label} variant="fullscreen" />;
}
