import type { UiLanguage } from "@/lib/researcher-profile";

/** Copy for the editor shell: boot failure, compile-fix prompt, leave guard. */
export type EditorShellCopy = {
  bootError: {
    title: string;
    retry: string;
    backToProjects: string;
  };
  /** Chat prompt pre-filled by «Ask Ario to fix» for a failed compile. */
  fixCompilePrompt: (compileError: string) => string;
  /** Confirm shown when leaving the editor with unsaved changes. */
  unsavedLeave: {
    title: string;
    body: string;
    stay: string;
    leave: string;
  };
};

const EN: EditorShellCopy = {
  bootError: {
    title: "Could not open project",
    retry: "Retry",
    backToProjects: "Back to projects",
  },
  fixCompilePrompt: (compileError) => `Fix this LaTeX compile error:\n\n${compileError}`,
  unsavedLeave: {
    title: "Leave without saving?",
    body: "Your latest changes to this file haven't been saved yet. If you leave now, they will be lost.",
    stay: "Stay",
    leave: "Leave anyway",
  },
};

const VI: EditorShellCopy = {
  bootError: {
    title: "Không mở được dự án",
    retry: "Thử lại",
    backToProjects: "Về danh sách dự án",
  },
  fixCompilePrompt: (compileError) => `Sửa lỗi biên dịch LaTeX này:\n\n${compileError}`,
  unsavedLeave: {
    title: "Rời đi mà không lưu?",
    body: "Những thay đổi mới nhất của file này chưa được lưu. Nếu rời đi bây giờ, chúng sẽ bị mất.",
    stay: "Ở lại",
    leave: "Vẫn rời đi",
  },
};

export function editorShellCopy(lang: UiLanguage): EditorShellCopy {
  return lang === "vi" ? VI : EN;
}
