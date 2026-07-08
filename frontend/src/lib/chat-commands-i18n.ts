import type { UiLanguage } from "@/lib/researcher-profile";
import type { ChatSlashTask, SlashCommandDef } from "@/lib/chat-commands";

type SlashCopy = {
  defaults: Partial<Record<ChatSlashTask, string>>;
  commands: SlashCommandDef[];
  hints: string[];
};

const EN: SlashCopy = {
  defaults: {
    logic: "Check manuscript logic",
    style: "Polish academic tone",
    structure: "Check IMRAD structure",
    citation: "Verify citations",
    template: "Generate IMRAD template",
    edit: "What to edit? (abstract, introduction, title, …)",
  },
  commands: [
    {
      command: "logic",
      task: "logic",
      description: "Logic audit Quick — fast claim–evidence scan",
      detail: "Gemini 2.5 Flash · ~1–2 min · default 3 IMRAD sections · comment-only",
    },
    {
      command: "logic full",
      task: "logic",
      description: "Logic audit — full manuscript",
      detail: "Gemini 3.5 Flash · ~3–8 min · up to 20 sections · Logic Audit tab",
    },
    {
      command: "structure",
      task: "structure",
      description: "Analyze IMRAD / manuscript outline",
      detail: "Section order, missing or extra standard parts",
    },
    {
      command: "citation",
      task: "citation",
      description: "Check citations and bibliography",
      detail: "Match \\cite{...} keys to available metadata",
    },
    {
      command: "edit",
      task: "edit",
      description: "Edit content with a specific instruction",
      detail: "Describe the change after the command · optional selection",
    },
    {
      command: "chat",
      task: "chat",
      description: "Q&A and explanations — does not modify the file",
      detail: "LaTeX help, ideas, peer review — no overwrite",
    },
  ],
  hints: [
    "/logic",
    "/logic full",
    "/structure",
    "/citation",
  ],
};

const VI: SlashCopy = {
  defaults: {
    logic: "Kiểm tra logic bài báo",
    style: "Chỉnh văn phong bản thảo",
    structure: "Kiểm tra cấu trúc bài báo",
    citation: "Kiểm tra trích dẫn",
    template: "Tạo khung IMRAD",
    edit: "Bạn muốn sửa phần nào? (abstract, introduction, tiêu đề, …)",
  },
  commands: [
    {
      command: "logic",
      task: "logic",
      description: "Logic audit Quick — quét nhanh logic & claim–evidence",
      detail: "Gemini 2.5 Flash · ~1–2 phút · mặc định 3 phần IMRAD · comment-only",
    },
    {
      command: "logic full",
      task: "logic",
      description: "Logic audit — toàn bộ bài",
      detail: "Gemini 3.5 Flash · ~3–8 phút · tối đa 20 section · tab Logic Audit",
    },
    {
      command: "structure",
      task: "structure",
      description: "Phân tích cấu trúc IMRAD / outline bản thảo",
      detail: "Gợi ý thứ tự section, thiếu/thừa phần chuẩn bài báo",
    },
    {
      command: "citation",
      task: "citation",
      description: "Kiểm tra trích dẫn và bibliography",
      detail: "Đối chiếu \\cite{...} với metadata có sẵn",
    },
    {
      command: "edit",
      task: "edit",
      description: "Chỉnh sửa nội dung theo yêu cầu cụ thể",
      detail: "Mô tả thay đổi sau lệnh · có thể kèm vùng chọn",
    },
    {
      command: "chat",
      task: "chat",
      description: "Hỏi đáp, giải thích — không tự sửa file",
      detail: "Giải thích LaTeX, ý tưởng, phản biện — không ghi đè bản thảo",
    },
  ],
  hints: [
    "/logic",
    "/logic full",
    "/structure",
    "/citation",
  ],
};

export function slashCopy(locale: UiLanguage): SlashCopy {
  return locale === "vi" ? VI : EN;
}

export function getChatSlashCommands(locale: UiLanguage): SlashCommandDef[] {
  return slashCopy(locale).commands;
}

export function getChatSlashHints(locale: UiLanguage): string[] {
  return slashCopy(locale).hints;
}

export function getSlashDefaultMessage(
  locale: UiLanguage,
  task: ChatSlashTask,
): string | undefined {
  return slashCopy(locale).defaults[task];
}
