import { useEffect, useRef } from "react";
import type React from "react";
import { PencilLine, X } from "lucide-react";
import { useLocale } from "@/components/locale-context";
import { ChatInput, ChatMessages, type ChatMessage } from "@/components/chat-overlay";
import { dicoAvatar } from "@/lib/dico-avatar";
import { LlmSelector } from "@/components/llm-selector";
import { PanelErrorBoundary } from "@/components/panel-error-boundary";
import { editorCopy } from "@/lib/editor-i18n";
import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";
import type { ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";

export function MobileChatSheet({
  onClose,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  onStop,
  chatEndRef,
  chatLoading,
  streamProgress,
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onNewChat,
  chatComposerMode = "normal",
  chatSelectionContext = null,
  onClearChatSelectionContext,
}: {
  onClose: () => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  streamProgress?: ChatStreamProgressSnapshot;
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onNewChat?: () => void;
  chatComposerMode?: "normal" | "quick-edit";
  chatSelectionContext?: EditorSelectionContext | null;
  onClearChatSelectionContext?: () => void;
}) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const canUseLlm = Boolean(
    providers &&
    providers.length > 0 &&
    llmProvider &&
    llmModel &&
    onProviderChange &&
    onModelChange,
  );
  const chatDisabled = !canUseLlm;

  useEffect(() => {
    if (chatComposerMode !== "quick-edit" || chatDisabled) return;
    const frame = requestAnimationFrame(() => chatInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [chatComposerMode, chatSelectionContext?.start, chatDisabled]);

  const placeholder = !canUseLlm
    ? t.chatDock.placeholderNoProvider
    : chatComposerMode === "quick-edit"
      ? t.chatDock.placeholderQuickEdit
      : chatSelectionContext
        ? t.chatDock.placeholderSelection
        : t.chatDock.placeholderDefault;

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:hidden">
      <button
        className="mobile-chat-backdrop absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label={t.chatDock.closeChat}
      />
      <div className="mobile-chat-sheet relative mt-auto flex max-h-[88dvh] min-h-[50dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border/50 bg-card shadow-[0_-8px_40px_-8px_rgba(15,23,42,0.2)]">
        <div className="mobile-chat-sheet-handle" aria-hidden />
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <img src={dicoAvatar} alt="" className="h-7 w-7 rounded-lg object-contain" />
            <span className="text-sm font-semibold tracking-tight">Dico</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mobile-chat-body flex min-h-0 flex-1 flex-col">
          <PanelErrorBoundary panel="chat" resetKeys={[messages.length]} fallbackClassName="flex-1">
            <ChatMessages
              messages={messages}
              chatEndRef={chatEndRef}
              chatLoading={chatLoading}
              streamProgress={streamProgress}
              surface="sheet"
            />
          </PanelErrorBoundary>
        </div>

        <div className="mobile-chat-composer shrink-0 border-t border-border/40 px-3 py-2 safe-area-pb">
          {chatComposerMode === "quick-edit" && (
            <div className="chat-quick-edit-banner mb-2" role="status">
              <PencilLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t.chatDock.quickEditBanner}</span>
            </div>
          )}
          {chatSelectionContext && (
            <div className="chat-selection-chip mb-2">
              <span className="chat-selection-chip-label">
                {chatSelectionContext.lineStart === chatSelectionContext.lineEnd
                  ? t.chatDock.selectionLine(chatSelectionContext.lineStart)
                  : t.chatDock.selectionLineRange(
                      chatSelectionContext.lineStart,
                      chatSelectionContext.lineEnd,
                    )}
                <span className="chat-selection-chip-preview">
                  {chatSelectionContext.text.trim().slice(0, 72)}
                  {chatSelectionContext.text.trim().length > 72 ? "…" : ""}
                </span>
              </span>
              {onClearChatSelectionContext && (
                <button
                  type="button"
                  className="chat-selection-chip-clear"
                  onClick={onClearChatSelectionContext}
                  aria-label={t.chatDock.clearSelection}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="chat-dock-llm-bar mb-1.5">
            {canUseLlm ? (
              <LlmSelector
                providers={providers!}
                llmProvider={llmProvider!}
                llmModel={llmModel!}
                onProviderChange={onProviderChange!}
                onModelChange={onModelChange!}
                onNewChat={onNewChat}
                compact
                variant="light"
              />
            ) : (
              <p className="chat-dock-llm-hint">{t.chatDock.llmHint}</p>
            )}
          </div>
          <ChatInput
            ref={chatInputRef}
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            onSend={onSend}
            onStop={onStop}
            disabled={chatDisabled}
            loading={chatLoading}
            placeholder={placeholder}
          />
        </div>
      </div>
    </div>
  );
}
