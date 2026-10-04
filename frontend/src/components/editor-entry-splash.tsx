import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useLocale } from "@/components/locale-context";
import { commonCopy } from "@/lib/common-i18n";
import { useMemo } from "react";

type EditorEntrySplashProps = {
  exiting?: boolean;
  label?: string;
};

export function EditorEntrySplash({ exiting = false, label }: EditorEntrySplashProps) {
  const { locale } = useLocale();
  const t = useMemo(() => commonCopy(locale).shell, [locale]);

  return (
    <AppLoadingScreen label={label ?? t.loadingProject} variant="fullscreen" exiting={exiting} />
  );
}
