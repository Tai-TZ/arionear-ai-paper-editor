import { useCallback, useEffect, useRef, useState, forwardRef } from "react";
import {
  ArrowUp,
  AudioLines,
  ChevronDown,
  ChevronUp,
  Copy,
  PanelRightClose,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import arioAvatar from "../../assets/avatar/avatar-chat.png";
import { LlmSelector } from "@/components/llm-selector";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";
import type { ChatAiStep, LLMProvider, ProviderInfo } from "@/lib/api/academic";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  activities?: string[];
  aiSteps?: ChatAiStep[];
  reasoning?: string;
  isStreaming?: boolean;
};

export function hasChatHistory(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "user");
}

const CHAT_DOCK_COLLAPSED_H = 92;
const CHAT_MIN_H = 220;
const CHAT_DEFAULT_RATIO = 0.38;

type ChatDockProps = {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  liveActivity?: string | null;
  streamAiSteps?: ChatAiStep[];
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onRefreshProviders?: () => void;
  composerMode?: "normal" | "quick-edit";
  selectionContext?: EditorSelectionContext | null;
  onClearSelectionContext?: () => void;
};

export function ChatOverlay(props: ChatDockProps) {
  return <ChatDock {...props} />;
}

export function ChatDock({
  open,
  onClose,
  onOpen,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  onStop,
  chatEndRef,
  chatLoading,
  liveActivity,
  streamAiSteps = [],
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onRefreshProviders,
  composerMode = "normal",
  selectionContext = null,
  onClearSelectionContext,
}: ChatDockProps) {
  const dockRef = useRef<HTMLElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [panelH, setPanelH] = useState(300);
  const initializedRef = useRef(false);
  const conversationStarted = hasChatHistory(messages);

  const clampHeight = useCallback((h: number) => {
    const max = dockRef.current?.parentElement
      ? Math.round(dockRef.current.parentElement.clientHeight * 0.55)
      : 480;
    return Math.min(Math.max(h, CHAT_MIN_H), Math.max(max, CHAT_MIN_H));
  }, []);

  useEffect(() => {
    if (!open || initializedRef.current || !dockRef.current?.parentElement) return;
    initializedRef.current = true;
    const parentH = dockRef.current.parentElement.clientHeight;
    setPanelH(clampHeight(Math.round(parentH * CHAT_DEFAULT_RATIO)));
  }, [open, clampHeight]);

  useEffect(() => {
    if (composerMode !== "quick-edit" || !open) return;
    const frame = requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [composerMode, open, selectionContext?.start]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, messages, chatLoading, liveActivity, chatEndRef]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelH;

    const onMove = (ev: MouseEvent) => {
      setPanelH(clampHeight(startH + (startY - ev.clientY)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const canUseLlm = Boolean(
    providers && providers.length > 0 && llmProvider && llmModel && onProviderChange && onModelChange,
  );

  const handleSend = () => {
    if (!chatInput.trim() || chatLoading || !canUseLlm) return;
    onSend();
  };

  const openFromComposer = () => {
    if (!open && conversationStarted) onOpen();
  };

  const placeholder = !canUseLlm
    ? "Cấu hình API key để dùng chat"
    : composerMode === "quick-edit"
      ? "Mô tả cách sửa đoạn đã chọn…"
      : selectionContext
        ? "Hỏi về vùng đã chọn…"
        : "Hỏi Ario bất cứ điều gì…";

  return (
    <aside
      ref={dockRef}
      className="chat-dock shrink-0"
      data-open={open}
      style={open ? { height: panelH + CHAT_DOCK_COLLAPSED_H } : undefined}
    >
      {open && (
        <div className="chat-dock-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="chat-dock-toolbar shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="chat-dock-icon-btn"
              aria-label="Thu gọn chat"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <div className="chat-dock-title">
              <img src={arioAvatar} alt="" className="chat-dock-title-avatar" />
              <span>Ario</span>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              className="chat-dock-icon-btn"
              aria-label="Đóng chat"
              onClick={onClose}
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </div>

          <ChatMessages
            messages={messages}
            chatEndRef={chatEndRef}
            chatLoading={chatLoading}
            liveActivity={liveActivity}
          />

          <button
            type="button"
            className="chat-dock-resize-handle"
            onMouseDown={startResize}
            aria-label="Kéo để đổi chiều cao chat"
          >
            <span className="chat-dock-resize-bar" />
          </button>
        </div>
      )}

      <div className="chat-dock-composer shrink-0">
        {!open && conversationStarted && !chatLoading && (
          <button type="button" className="chat-dock-expand-btn" onClick={onOpen}>
            <ChevronUp className="h-3.5 w-3.5" />
            <span>Xem lịch sử chat</span>
          </button>
        )}

        {chatLoading && !open && (
          <ChatProgressStrip activity={liveActivity} steps={streamAiSteps} />
        )}

        {composerMode === "quick-edit" && (
          <div className="chat-quick-edit-banner" role="status">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Quick Edit — chỉnh sửa vùng đã chọn trong editor</span>
          </div>
        )}

        {selectionContext && (
          <div className="chat-selection-chip">
            <span className="chat-selection-chip-label">
              {selectionContext.lineStart === selectionContext.lineEnd
                ? `Dòng ${selectionContext.lineStart}`
                : `Dòng ${selectionContext.lineStart}–${selectionContext.lineEnd}`}
              <span className="chat-selection-chip-preview">
                {selectionContext.text.trim().slice(0, 72)}
                {selectionContext.text.trim().length > 72 ? "…" : ""}
              </span>
            </span>
            {onClearSelectionContext && (
              <button
                type="button"
                className="chat-selection-chip-clear"
                onClick={onClearSelectionContext}
                aria-label="Bỏ vùng chọn"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="chat-dock-llm-bar">
          <span className="chat-dock-llm-label">AI</span>
          {canUseLlm ? (
            <LlmSelector
              providers={providers!}
              llmProvider={llmProvider!}
              llmModel={llmModel!}
              onProviderChange={onProviderChange!}
              onModelChange={onModelChange!}
              onRefresh={onRefreshProviders}
              compact
              variant="light"
            />
          ) : (
            <p className="chat-dock-llm-hint">
              Thêm <code>OPENROUTER_API_KEY</code> (hoặc OpenAI/Anthropic) vào <code>.env</code> rồi restart
              backend.
            </p>
          )}
        </div>

        <ChatInput
          ref={chatInputRef}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          onSend={handleSend}
          onStop={onStop}
          onActivate={openFromComposer}
          disabled={!canUseLlm}
          loading={chatLoading}
          placeholder={placeholder}
        />
      </div>
    </aside>
  );
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

function assistantHasBody(message: ChatMessage): boolean {
  return Boolean(
    message.content?.trim() ||
      message.reasoning?.trim() ||
      (message.activities?.length ?? 0) > 0 ||
      (message.aiSteps?.length ?? 0) > 0,
  );
}

function ChatProgressStrip({
  activity,
  steps,
}: {
  activity?: string | null;
  steps: ChatAiStep[];
}) {
  const active = steps.find((s) => s.status === "active");
  const label = active?.label ?? activity ?? "Đang xử lý…";
  const detail = active?.detail ?? "";

  return (
    <div className="chat-progress-strip" role="status" aria-live="polite" aria-atomic="true">
      <div className="chat-progress-strip-head">
        <span className="chat-progress-strip-dot" aria-hidden />
        <span className="chat-progress-strip-label">{label}</span>
        {detail ? <span className="chat-progress-strip-detail">{detail}</span> : null}
      </div>
      {steps.length > 0 && (
        <ol className="chat-progress-mini-steps">
          {steps.map((step) => (
            <li
              key={step.id}
              className={`chat-progress-mini-step chat-progress-mini-step--${step.status}`}
              title={step.detail ? `${step.label} — ${step.detail}` : step.label}
            >
              <span className="chat-progress-mini-icon" aria-hidden>
                {step.status === "done" ? "✓" : step.status === "active" ? "●" : "○"}
              </span>
              <span className="chat-progress-mini-label">{step.label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ChatThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="chat-thinking-row">
      <span className="chat-thinking-dot" aria-hidden />
      <span className="chat-thinking-label">{label}</span>
    </div>
  );
}

function ChatAiStatePanel({ steps }: { steps: ChatAiStep[] }) {
  if (!steps.length) return null;

  return (
    <div className="chat-ai-state" role="status" aria-live="polite" aria-atomic="false">
      <p className="chat-ai-state-title">Tiến trình xử lý</p>
      <ol className="chat-ai-steps">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`chat-ai-step chat-ai-step--${step.status}`}
            data-status={step.status}
          >
            <span className="chat-ai-step-icon" aria-hidden>
              {step.status === "done" ? "✓" : step.status === "active" ? "●" : "○"}
            </span>
            <span className="chat-ai-step-body">
              <span className="chat-ai-step-label">{step.label}</span>
              {step.detail ? (
                <span className="chat-ai-step-detail">{step.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ChatMessages({
  messages,
  chatEndRef,
  chatLoading,
  liveActivity,
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  liveActivity?: string | null;
}) {
  const visibleMessages = messages.filter(
    (m) => m.role === "user" || assistantHasBody(m) || m.isStreaming,
  );

  return (
    <div className="soft-scrollbar chat-messages flex-1 overflow-y-auto px-4 py-3">
      {visibleMessages.length === 0 && !chatLoading && (
        <p className="chat-dock-empty-hint">
          Chọn provider và model phía dưới, sau đó gửi câu hỏi hoặc yêu cầu chỉnh sửa LaTeX.
        </p>
      )}

      {visibleMessages.map((m, i) => {
        if (m.role === "user") {
          return (
            <div key={i} className="chat-message-row chat-user-row">
              <div className="chat-user-stack">
                <div className="chat-bubble chat-bubble-user-dark">{m.content}</div>
                <button
                  type="button"
                  className="chat-copy-btn"
                  aria-label="Copy message"
                  onClick={() => copyText(m.content)}
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        }

        const isLast = i === visibleMessages.length - 1;
        const waitingForFirstChunk = m.isStreaming && !assistantHasBody(m);
        const hasAiSteps = (m.aiSteps?.length ?? 0) > 0;
        const thinkingLabel =
          (isLast && liveActivity) ||
          m.aiSteps?.find((s) => s.status === "active")?.label ||
          m.activities?.[m.activities.length - 1] ||
          "Đang xử lý…";

        return (
          <div key={i} className="chat-message-row chat-assistant-row">
            <img src={arioAvatar} alt="Ario" className="chat-avatar shrink-0" />
            {waitingForFirstChunk ? (
              <ChatThinkingIndicator label={thinkingLabel} />
            ) : (
              <div className="chat-assistant-content min-w-0 flex-1">
                {hasAiSteps && (
                  <ChatAiStatePanel steps={m.aiSteps!} />
                )}
                {!hasAiSteps && (m.activities?.length ?? 0) > 0 && (
                  <ul className="chat-activity-feed mb-2 space-y-0.5">
                    {m.activities!.map((line, j) => (
                      <li
                        key={j}
                        className={`font-mono text-[10px] leading-snug text-[var(--chat-muted)] ${
                          m.isStreaming && j === m.activities!.length - 1
                            ? "chat-activity-live"
                            : ""
                        }`}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
                {m.reasoning && (
                  <p className="chat-reasoning-block mb-2 text-[11px] italic leading-snug text-[var(--chat-muted)]">
                    {m.reasoning}
                    {m.isStreaming && !m.content && (
                      <span className="chat-stream-cursor" aria-hidden />
                    )}
                  </p>
                )}
                {m.content && <p className="chat-assistant-text">{m.content}</p>}
                {m.isStreaming && m.content && (
                  <span className="chat-stream-cursor" aria-hidden />
                )}
                {m.isStreaming && assistantHasBody(m) && !m.content && !m.reasoning && (
                  <ChatThinkingIndicator label={thinkingLabel} />
                )}
              </div>
            )}
          </div>
        );
      })}

      <div ref={chatEndRef} />
    </div>
  );
}

export const ChatInput = forwardRef<HTMLTextAreaElement, {
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  onActivate?: () => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}>(function ChatInput(
  {
    chatInput,
    onChatInputChange,
    onSend,
    onStop,
    onActivate,
    placeholder,
    disabled,
    loading = false,
  },
  ref,
) {
  const canSend = chatInput.trim().length > 0 && !disabled;

  const handlePrimaryAction = () => {
    if (loading) {
      onStop?.();
      return;
    }
    onSend();
  };

  return (
    <div className="chat-input-shell">
      <textarea
        ref={ref}
        value={chatInput}
        onChange={(e) => onChatInputChange(e.target.value)}
        onFocus={() => onActivate?.()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!loading) onSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="chat-input-field"
      />
      <div className="chat-input-actions">
        <button type="button" className="chat-input-icon-btn" aria-label="Add context">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" className="chat-input-icon-btn" aria-label="Voice input">
          <AudioLines className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={!loading && !canSend}
          className={`chat-send-btn ${loading ? "chat-send-btn-loading" : ""}`}
          aria-label={loading ? "Dừng xử lý" : "Send message"}
        >
          {loading ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
});

export { arioAvatar };
