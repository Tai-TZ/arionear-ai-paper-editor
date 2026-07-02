import type { ChatMessage } from "@/components/chat-overlay";
import { editorCopy } from "@/lib/editor-i18n";
import { updatePaper } from "@/lib/api/papers-api";
import type { ChatThread, StoredChatMessage } from "@/lib/project-store";
import type { UiLanguage } from "@/lib/researcher-profile";

export function makeInitialMessages(locale: UiLanguage): ChatMessage[] {
  return [{ role: "assistant", content: editorCopy(locale).welcome.assistantMessage }];
}

export function threadHasUserMessages(msgs: ChatMessage[]): boolean {
  return msgs.some((m) => m.role === "user");
}

export function isPersistedThread(thread: ChatThread): boolean {
  return thread.messages.some((m) => m.role === "user");
}

export function getPersistedThreads(threads: ChatThread[]): ChatThread[] {
  return threads.filter(isPersistedThread);
}

export function stripMessagesForStorage(msgs: ChatMessage[]): StoredChatMessage[] {
  const userIdx = msgs.findIndex((m) => m.role === "user");
  if (userIdx === -1) return [];
  return msgs
    .slice(userIdx)
    .filter((m) => !m.isStreaming)
    .map((m) => ({ role: m.role, content: m.content, ...(m.isError ? { isError: true } : {}) }));
}

export function snapshotActiveThread(
  threads: ChatThread[],
  activeId: string,
  currentMessages: ChatMessage[],
): ChatThread[] {
  const hasUser = threadHasUserMessages(currentMessages);
  const withoutActiveDraft = threads.filter((th) => th.id !== activeId || hasUser);
  if (!hasUser) return withoutActiveDraft;
  return withoutActiveDraft.map((th) =>
    th.id === activeId
      ? { ...th, messages: stripMessagesForStorage(currentMessages), updatedAt: Date.now() }
      : th,
  );
}

export function persistChatThreads(
  projectId: string,
  threads: ChatThread[],
  onError?: () => void,
) {
  updatePaper(projectId, { chatThreads: getPersistedThreads(threads) })
    .catch(() => {
      onError?.();
    });
}
