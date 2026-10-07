import type { ChatMessage } from "@/components/chat-overlay";

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

const WELCOME_PREFIX = "Xin chào — tôi là Nib";
const MAX_TURN_CONTENT = 4000;
const DEFAULT_MAX_TURNS = 6;

function isWelcomeAssistant(message: ChatMessage, index: number, all: ChatMessage[]): boolean {
  if (message.role !== "assistant") return false;
  if (!message.content.trim().startsWith(WELCOME_PREFIX)) return false;
  return !all.slice(0, index).some((m) => m.role === "user");
}

/** Last N user/assistant turns for backend conversation memory (excludes current send). */
export function buildConversationHistory(
  messages: ChatMessage[],
  maxTurns = DEFAULT_MAX_TURNS,
): ChatHistoryTurn[] {
  const eligible = messages.filter(
    (m) =>
      !m.isStreaming &&
      m.content.trim() &&
      (m.role === "user" || m.role === "assistant") &&
      !m.isError,
  );

  const turns: ChatHistoryTurn[] = [];
  for (let i = 0; i < eligible.length; i += 1) {
    const m = eligible[i];
    if (isWelcomeAssistant(m, i, eligible)) continue;
    turns.push({
      role: m.role,
      content: m.content.trim().slice(0, MAX_TURN_CONTENT),
    });
  }

  return turns.slice(-maxTurns);
}
