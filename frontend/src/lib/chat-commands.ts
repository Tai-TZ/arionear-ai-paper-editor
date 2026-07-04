import type { UiLanguage } from "@/lib/researcher-profile";
import {
  getChatSlashCommands,
  getChatSlashHints,
  getSlashDefaultMessage,
} from "@/lib/chat-commands-i18n";

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

/** @deprecated Use getChatSlashCommands(locale) */
export const CHAT_SLASH_COMMANDS = getChatSlashCommands("vi");

/** @deprecated Use getChatSlashHints(locale) */
export const CHAT_SLASH_HINTS = getChatSlashHints("vi");

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

export function filterSlashCommands(
  query: string,
  locale: UiLanguage = "vi",
): SlashCommandDef[] {
  const commands = getChatSlashCommands(locale);
  const q = query.toLowerCase().trim();
  if (!q) return commands;
  return commands.filter((c) => {
    const cmd = c.command.toLowerCase();
    return cmd.startsWith(q) || cmd.includes(q);
  });
}

export function slashCommandInsert(cmd: SlashCommandDef): string {
  return cmd.insertText ?? `/${cmd.command} `;
}

const CASUAL_GREETING_RE =
  /^(?:h+u+l+o+|hello(?:\s+(?:there|everyone|bao))?|hi(?:\s+(?:there|everyone|bao))?|hey|chào(?:\s+(?:bạn|ban|nhé|nhe|anh|chị|chi|em|mọi\s+người|moi\s+nguoi))?|chao|xin\s*chào|yo|hú|hu|hì|helo|good\s*(?:morning|afternoon|evening)|thanks?|thank\s*you|cảm\s*ơn|cam\s*on|ok(?:ay)?|oke|ừ|uh|ah|test|thử|thu)\s*[!?.…]*$/i;

const CASUAL_ACKNOWLEDGMENT_RE =
  /^(?:rất\s+tốt|rat\s+tot|good(?:\s+(?:job|work))?|nice|great|perfect|tuyệt|tuyet|ổn|on|được|duoc)\s*[!?.…]*$/i;

const CASUAL_CONVERSATIONAL_RE =
  /bạn\s+là\s+ai|who\s+are\s+you|what\s+can\s+you\s+do|giúp\s+tôi\s+gì|help\s+me|bạn\s+biết\s+gì/i;

/** Greetings / small talk — must not trigger quick-edit or edit follow-up heuristics. */
export function isCasualChatMessage(message: string): boolean {
  const q = message.trim();
  if (!q) return true;
  if (CASUAL_GREETING_RE.test(q)) return true;
  if (CASUAL_ACKNOWLEDGMENT_RE.test(q)) return true;
  return CASUAL_CONVERSATIONAL_RE.test(q);
}

export function parseChatSlashCommand(
  raw: string,
  locale: UiLanguage = "vi",
): {
  task: ChatSlashTask | null;
  message: string;
  command: string | null;
  logicAuditMode?: "quick" | "deep";
  logicAuditScope?: "selected" | "full";
} {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) {
    return { task: null, message: trimmed, command: null };
  }

  const spaceIdx = trimmed.indexOf(" ");
  const cmdPart = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const text = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

  const logicAuditMode =
    cmdPart === "logic deep" || cmdPart === "logic deep full" ? ("deep" as const) : undefined;
  const logicAuditScope =
    cmdPart === "logic full" || cmdPart === "logic deep full"
      ? ("full" as const)
      : cmdPart.startsWith("logic")
        ? ("selected" as const)
        : undefined;

  const baseCmd = cmdPart.split(" ")[0];
  const task = COMMAND_TO_TASK[baseCmd] ?? COMMAND_TO_TASK[cmdPart] ?? null;

  if (!task) {
    return { task: null, message: trimmed, command: null };
  }

  return {
    task,
    message: getSlashDefaultMessage(locale, task) ?? text,
    command: cmdPart,
    ...(logicAuditMode ? { logicAuditMode } : {}),
    ...(logicAuditScope ? { logicAuditScope } : {}),
  };
}
