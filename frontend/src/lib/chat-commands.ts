export type ChatSlashTask =
  | "style"
  | "structure"
  | "logic"
  | "citation"
  | "chat"
  | "edit"
  | "template";

export type SlashCommandDef = {
  /** Shown in menu and used for filter prefix (may include spaces, e.g. "logic deep"). */
  command: string;
  task: ChatSlashTask;
  description: string;
  /** Extra line: engine, thời gian, gợi ý UI. */
  detail?: string;
  /** Text inserted into the composer (defaults to `/${command} `). */
  insertText?: string;
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
    description: "Logic audit Quick — quét nhanh logic & claim–evidence",
    detail: "OpenRouter · ~2–3 phút · mặc định 3 phần IMRAD · comment-only",
  },
  {
    command: "logic full",
    task: "logic",
    description: "Logic audit Quick — toàn bộ bài",
    detail: "OpenRouter · ~5–10 phút · tối đa 20 section · tab Logic Audit để xem chi tiết",
  },
  {
    command: "logic deep",
    task: "logic",
    description: "Logic audit Deep — soi sâu 1 phần",
    detail: "MiniMax M3 (engine riêng) · ~3–5 phút · không dùng provider chat",
  },
  {
    command: "logic deep full",
    task: "logic",
    description: "Logic audit Deep — toàn bộ bài",
    detail: "MiniMax M3 · ~10–20 phút · tối đa 8 section · chọn section ở tab Logic Audit",
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
];

export const CHAT_SLASH_HINTS = [
  "/logic",
  "/logic full",
  "/logic deep",
  "/style",
  "/structure",
  "/citation",
];

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
  const q = query.toLowerCase().trim();
  if (!q) return CHAT_SLASH_COMMANDS;
  return CHAT_SLASH_COMMANDS.filter((c) => {
    const key = c.command.toLowerCase();
    return key.startsWith(q) || key.includes(q);
  });
}

export function slashCommandInsert(cmd: SlashCommandDef | string): string {
  if (typeof cmd === "string") return `/${cmd} `;
  const text = cmd.insertText ?? `/${cmd.command}`;
  return text.endsWith(" ") ? text : `${text} `;
}

export type LogicAuditMode = "quick" | "deep";

function _parse_logic_flags(rest: string): {
  logicAuditMode?: LogicAuditMode;
  logicAuditScope?: "selected" | "full";
  rest: string;
} {
  let remaining = rest.trim();
  let logicAuditMode: LogicAuditMode | undefined;
  let logicAuditScope: "selected" | "full" | undefined;

  if (/^(deep\s+full|full\s+deep)\b/i.test(remaining)) {
    logicAuditMode = "deep";
    logicAuditScope = "full";
    remaining = remaining.replace(/^(deep\s+full|full\s+deep)\s*/i, "").trim();
  } else if (/^full\b/i.test(remaining)) {
    logicAuditScope = "full";
    remaining = remaining.replace(/^full\s*/i, "").trim();
  }

  if (/^deep\b/i.test(remaining)) {
    logicAuditMode = "deep";
    remaining = remaining.replace(/^deep\s*/i, "").trim();
  } else if (/^quick\b/i.test(remaining)) {
    logicAuditMode = "quick";
    remaining = remaining.replace(/^quick\s*/i, "").trim();
  }

  return { logicAuditMode, logicAuditScope, rest: remaining };
}

export function parseChatSlashCommand(raw: string): {
  task?: ChatSlashTask;
  message: string;
  command?: string;
  logicAuditMode?: LogicAuditMode;
  logicAuditScope?: "selected" | "full";
} {
  const text = raw.trim();
  const match = /^\/(\w+)\s*(.*)$/s.exec(text);
  if (!match) return { message: raw };

  const command = match[1].toLowerCase();
  const task = COMMAND_TO_TASK[command];
  if (!task) return { message: raw };

  let rest = (match[2] ?? "").trim();
  let logicAuditMode: LogicAuditMode | undefined;
  let logicAuditScope: "selected" | "full" | undefined;
  if (command === "logic") {
    const flags = _parse_logic_flags(rest);
    logicAuditMode = flags.logicAuditMode;
    logicAuditScope = flags.logicAuditScope;
    rest = flags.rest;
  }

  if (rest) {
    return { task, message: rest, command, logicAuditMode, logicAuditScope };
  }
  return {
    task,
    message: DEFAULT_MESSAGES[task] ?? text,
    command,
    logicAuditMode,
    logicAuditScope,
  };
}
