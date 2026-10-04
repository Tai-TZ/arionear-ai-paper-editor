import { AppLoadingScreen } from "@/components/app-loading-screen";
import { useLocale } from "@/components/locale-provider";
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
    <AppLoadingScreen
      label={label ?? t.loadingProject}
      variant="fullscreen"
      exiting={exiting}
    />
  );
}

const EDITOR_ENTRY_FLAG = "arionear:editor-entry";

export function markEditorEntryTransition() {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(EDITOR_ENTRY_FLAG, "1");
  }
}
