export type ChatSlashTask =
  | "style"
  | "structure"
  | "logic"
  | "citation"
  | "chat"
  | "edit"
  | "template";

const COMMAND_TO_TASK: Record<string, ChatSlashTask> = {
  logic: "logic",
  style: "style",
  structure: "structure",
  citation: "citation",
  citations: "citation",
  template: "template",
  edit: "edit",
  chat: "chat",
};

const DEFAULT_MESSAGES: Partial<Record<ChatSlashTask, string>> = {
  logic: "Kiểm tra logic bài báo",
  style: "Chỉnh văn phong bản thảo",
  structure: "Kiểm tra cấu trúc bài báo",
  citation: "Kiểm tra trích dẫn",
  template: "Tạo khung IMRAD",
  edit: "Chỉnh sửa bản thảo",
};

export const CHAT_SLASH_HINTS = ["/logic", "/style", "/structure", "/citation", "/edit"];

export function parseChatSlashCommand(raw: string): {
  task?: ChatSlashTask;
  message: string;
  command?: string;
} {
  const text = raw.trim();
  const match = /^\/(\w+)\s*(.*)$/s.exec(text);
  if (!match) return { message: raw };

  const command = match[1].toLowerCase();
  const task = COMMAND_TO_TASK[command];
  if (!task) return { message: raw };

  const rest = (match[2] ?? "").trim();
  if (rest) return { task, message: rest, command };
  return {
    task,
    message: DEFAULT_MESSAGES[task] ?? text,
    command,
  };
}
