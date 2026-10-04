import type { UiLanguage } from "@/lib/researcher-profile";

/** Copy for the editor shell: boot failure, compile-fix prompt. */
export type EditorShellCopy = {
  bootError: {
    title: string;
    retry: string;
    backToProjects: string;
  };
  /** Chat prompt pre-filled by «Ask Ario to fix» for a failed compile. */
  fixCompilePrompt: (compileError: string) => string;
};

const EN: EditorShellCopy = {
  bootError: {
    title: "Could not open project",
    retry: "Retry",
    backToProjects: "Back to projects",
  },
  fixCompilePrompt: (compileError) => `Fix this LaTeX compile error:\n\n${compileError}`,
};

const VI: EditorShellCopy = {
  bootError: {
    title: "Không mở được dự án",
    retry: "Thử lại",
    backToProjects: "Về danh sách dự án",
  },
  fixCompilePrompt: (compileError) => `Sửa lỗi biên dịch LaTeX này:\n\n${compileError}`,
};

export function editorShellCopy(lang: UiLanguage): EditorShellCopy {
  return lang === "vi" ? VI : EN;
}
