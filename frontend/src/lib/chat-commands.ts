export type ChatSlashTask =
  | "style"
  | "structure"
  | "logic"
  | "citation"
  | "chat"
  | "edit"
  | "template";

export type SlashCommandDef = {
  command: string;
  task: ChatSlashTask;
  description: string;
};

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

/** Catalog shown in the Telegram-style slash menu. */
export const CHAT_SLASH_COMMANDS: SlashCommandDef[] = [
  {
    command: "logic",
    task: "logic",
    description: "Kiểm tra logic, mâu thuẫn và claim–evidence (comment-only)",
  },
  {
    command: "style",
    task: "style",
    description: "Chỉnh văn phong học thuật, giữ nguyên ý nghĩa",
  },
  {
    command: "structure",
    task: "structure",
    description: "Phân tích cấu trúc IMRAD / outline bản thảo",
  },
  {
    command: "citation",
    task: "citation",
    description: "Kiểm tra trích dẫn và bibliography",
  },
  {
    command: "template",
    task: "template",
    description: "Tạo khung IMRAD trống trong file",
  },
  {
    command: "edit",
    task: "edit",
    description: "Chỉnh sửa nội dung theo yêu cầu cụ thể",
  },
  {
    command: "chat",
    task: "chat",
    description: "Hỏi đáp, giải thích — không tự sửa file",
  },
];

export const CHAT_SLASH_HINTS = CHAT_SLASH_COMMANDS.map((c) => `/${c.command}`);

/** Prefix after `/` while picking a command, or null when menu should hide. */
export function getSlashCommandQuery(input: string): string | null {
  if (!input.startsWith("/")) return null;

  const spaceIdx = input.indexOf(" ");
  if (spaceIdx !== -1) {
    const cmd = input.slice(1, spaceIdx).toLowerCase();
    if (COMMAND_TO_TASK[cmd]) return null;
    return null;
  }

  return input.slice(1);
}

export function filterSlashCommands(query: string): SlashCommandDef[] {
  const q = query.toLowerCase();
  return CHAT_SLASH_COMMANDS.filter((c) => c.command.startsWith(q));
}

export function slashCommandInsert(command: string): string {
  return `/${command} `;
}

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
