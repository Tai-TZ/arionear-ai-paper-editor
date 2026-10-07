import type { UiLanguage } from "@/lib/researcher-profile";

/** Copy for the editor shell: boot failure, compile-fix prompt, leave guard, error boundaries. */
export type EditorShellCopy = {
  bootError: {
    title: string;
    retry: string;
    backToProjects: string;
  };
  /** Chat prompt pre-filled by «Ask Dico to fix» for a failed compile. */
  fixCompilePrompt: (compileError: string) => string;
  /** Confirm shown when leaving the editor with unsaved changes. */
  unsavedLeave: {
    title: string;
    body: string;
    stay: string;
    leave: string;
  };
  /** `/editor` route error boundary. */
  routeError: {
    eyebrow: string;
    title: string;
    body: string;
    retry: string;
    back: string;
  };
  /** Local boundaries that keep the LaTeX editor alive when a side panel crashes. */
  panelError: {
    chat: string;
    pdf: string;
    retry: string;
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
  routeError: {
    eyebrow: "Editor error",
    title: "The editor ran into a problem",
    body: "Your last saved version is safe on the server. Try again, or go back to your projects.",
    retry: "Try again",
    back: "Back to projects",
  },
  panelError: {
    chat: "The chat panel hit an unexpected error. Your manuscript is not affected.",
    pdf: "The PDF preview hit an unexpected error. Your manuscript is not affected.",
    retry: "Try again",
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
  routeError: {
    eyebrow: "Lỗi trình biên tập",
    title: "Trình biên tập gặp sự cố",
    body: "Bản đã lưu gần nhất vẫn an toàn trên server. Hãy thử lại, hoặc quay về danh sách dự án.",
    retry: "Thử lại",
    back: "Về danh sách dự án",
  },
  panelError: {
    chat: "Khung chat gặp lỗi ngoài ý muốn. Bản thảo của bạn không bị ảnh hưởng.",
    pdf: "Khung xem trước PDF gặp lỗi ngoài ý muốn. Bản thảo của bạn không bị ảnh hưởng.",
    retry: "Thử lại",
  },
};

export function editorShellCopy(lang: UiLanguage): EditorShellCopy {
  return lang === "vi" ? VI : EN;
}
