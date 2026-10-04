export type DefenseMessage = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  isCancelled?: boolean;
  isError?: boolean;
};

export function countCompletedCouncilTurns(messages: DefenseMessage[]): number {
  return messages.filter(
    (m) =>
      m.role === "assistant" &&
      !m.isStreaming &&
      !m.isCancelled &&
      !m.isError &&
      m.content.trim().length > 0,
  ).length;
}

/** Conversation turns sent to the defense API (excludes errors and empty cancellations). */
export function buildDefenseConversationHistory(
  messages: DefenseMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => !(m.isCancelled && !m.content.trim()))
    .filter((m) => !m.isError)
    .map((m) => ({ role: m.role, content: m.content }));
}
