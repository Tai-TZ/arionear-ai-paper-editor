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
      detail: "Z.AI GLM-4.7 Flash · ~2–3 min · default 3 IMRAD sections · comment-only",
    },
    {
      command: "logic full",
      task: "logic",
      description: "Logic audit Quick — full manuscript",
      detail: "Z.AI GLM-4.7 Flash · ~5–10 min · up to 20 sections · Logic Audit tab",
    },
    {
      command: "logic deep",
      task: "logic",
      description: "Logic audit Deep — one section in depth",
      detail: "Z.AI GLM-4.7 (dedicated engine) · ~3–5 min · not the chat provider",
    },
    {
      command: "logic deep full",
      task: "logic",
      description: "Logic audit Deep — full manuscript",
      detail: "Z.AI GLM-4.7 · ~10–20 min · up to 8 sections",
    },
    {
      command: "style",
      task: "style",
      description: "Polish academic tone, preserve meaning",
      detail: "Uses selected provider/model · suggests scoped edits",
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
      command: "template",
      task: "template",
      description: "Insert empty IMRAD scaffold in the file",
      detail: "Abstract, Introduction, Methods, Results, Conclusion",
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
    "/logic deep",
    "/style",
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
      detail: "Z.AI GLM-4.7 Flash · ~2–3 phút · mặc định 3 phần IMRAD · comment-only",
    },
    {
      command: "logic full",
      task: "logic",
      description: "Logic audit Quick — toàn bộ bài",
      detail: "Z.AI GLM-4.7 Flash · ~5–10 phút · tối đa 20 section · tab Logic Audit",
    },
    {
      command: "logic deep",
      task: "logic",
      description: "Logic audit Deep — soi sâu 1 phần",
      detail: "Z.AI GLM-4.7 (engine riêng) · ~3–5 phút · không dùng provider chat",
    },
    {
      command: "logic deep full",
      task: "logic",
      description: "Logic audit Deep — toàn bộ bài",
      detail: "Z.AI GLM-4.7 · ~10–20 phút · tối đa 8 section",
    },
    {
      command: "style",
      task: "style",
      description: "Chỉnh văn phong học thuật, giữ nguyên ý nghĩa",
      detail: "Dùng provider/model đang chọn · đề xuất sửa từng đoạn",
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
      command: "template",
      task: "template",
      description: "Tạo khung IMRAD trống trong file",
      detail: "Abstract, Introduction, Methods, Results, Conclusion",
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
    "/logic deep",
    "/style",
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
