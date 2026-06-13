import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AudioLines,
  ChevronDown,
  Copy,
  PanelRightClose,
  Plus,
  RefreshCw,
  Square,
} from "lucide-react";

import arioAvatar from "../../assets/avatar/avatar-chat.png";
import { LlmSelector } from "@/components/llm-selector";
import type { LLMProvider, ProviderInfo } from "@/lib/api/academic";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  activities?: string[];
  reasoning?: string;
  isStreaming?: boolean;
};

export function hasChatHistory(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "user");
}

const CHAT_COLLAPSED_H = 52;
const CHAT_MIN_H = 260;
const CHAT_DEFAULT_RATIO = 0.42;

type ChatOverlayProps = {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  liveActivity?: string | null;
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onHeightChange?: (h: number) => void;
  onRefreshProviders?: () => void;
};

export function ChatOverlay({
  open,
  onClose,
  onOpen,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  chatEndRef,
  chatLoading,
  liveActivity,
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onHeightChange,
  onRefreshProviders,
}: ChatOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [panelH, setPanelH] = useState(360);
  const initializedRef = useRef(false);
  const conversationStarted = hasChatHistory(messages);

  const clampHeight = useCallback((h: number) => {
    const max = rootRef.current
      ? Math.round(rootRef.current.clientHeight * 0.88)
      : 560;
    return Math.min(Math.max(h, CHAT_MIN_H), Math.max(max, CHAT_MIN_H));
  }, []);

  useEffect(() => {
    if (!open || initializedRef.current || !rootRef.current) return;
    initializedRef.current = true;
    setPanelH(clampHeight(Math.round(rootRef.current.clientHeight * CHAT_DEFAULT_RATIO)));
  }, [open, clampHeight]);

  useEffect(() => {
    onHeightChange?.(open ? panelH : CHAT_COLLAPSED_H);
  }, [open, panelH, onHeightChange]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, chatEndRef]);

  const openPanelFromInput = () => {
    if (!open && conversationStarted) onOpen();
  };

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

  const handleSend = () => {
    if (!chatInput.trim() || chatLoading) return;
    if (!open) onOpen();
    onSend();
  };

  return (
    <div ref={rootRef} className="chat-overlay-root pointer-events-none absolute inset-0 z-20">
      <div
        className="chat-overlay-panel pointer-events-auto absolute inset-x-4 bottom-4 flex flex-col overflow-hidden"
        data-open={open}
        style={{ height: open ? panelH : CHAT_COLLAPSED_H }}
      >
        <div className="chat-overlay-messages-section flex min-h-0 flex-1 flex-col overflow-hidden">
          <button
            type="button"
            className="chat-resize-handle"
            onMouseDown={startResize}
            aria-label="Resize chat panel"
            tabIndex={open ? 0 : -1}
          >
            <span className="chat-resize-handle-bar" />
          </button>

          <div className="chat-overlay-toolbar shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="chat-overlay-icon-btn"
              aria-label="Minimize chat"
            >
              <ChevronDown className="h-4 w-4" />
            </button>

            <div className="flex-1" />

            {providers &&
              providers.length > 0 &&
              llmProvider &&
              llmModel &&
              onProviderChange &&
              onModelChange && (
                <LlmSelector
                  providers={providers}
                  llmProvider={llmProvider}
                  llmModel={llmModel}
                  onProviderChange={onProviderChange}
                  onModelChange={onModelChange}
                  compact
                  variant="light"
                />
              )}

            <button
              type="button"
              className="chat-overlay-icon-btn"
              aria-label="Refresh providers"
              onClick={onRefreshProviders}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="chat-overlay-icon-btn"
              aria-label="Close chat panel"
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
        </div>

        <div
          className={`chat-overlay-input-wrap shrink-0 ${open ? "" : "chat-overlay-input-wrap-collapsed"}`}
          onMouseDown={(e) => {
            if (!open && conversationStarted && e.target === e.currentTarget) {
              onOpen();
            }
          }}
        >
          <ChatInput
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            onSend={handleSend}
            onActivate={openPanelFromInput}
            disabled={chatLoading}
            loading={chatLoading}
            placeholder="Ask anything"
            collapsed={!open}
          />
        </div>
      </div>
    </div>
  );
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
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
  const lastAssistantStreaming = messages.at(-1)?.role === "assistant" && messages.at(-1)?.isStreaming;

  return (
    <div className="soft-scrollbar chat-messages flex-1 overflow-y-auto px-4 py-4">
      {messages.map((m, i) => {
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

        return (
          <div key={i} className="chat-message-row chat-assistant-row">
            <img src={arioAvatar} alt="Ario" className="chat-avatar shrink-0" />
            <div className="chat-assistant-content min-w-0 flex-1">
              {(m.activities?.length ?? 0) > 0 && (
                <ul className="chat-activity-feed mb-2 space-y-0.5">
                  {m.activities!.map((line, j) => (
                    <li
                      key={j}
                      className={`font-mono text-[10px] leading-snug text-[var(--chat-muted)] ${
                        m.isStreaming && j === m.activities!.length - 1 ? "chat-activity-live" : ""
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
            </div>
          </div>
        );
      })}

      {chatLoading && !lastAssistantStreaming && (
        <div className="chat-thinking-row">
          <span className="chat-thinking-dot" aria-hidden />
          <span className="chat-thinking-label">{liveActivity || "Thinking"}</span>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>
  );
}

export function ChatInput({
  chatInput,
  onChatInputChange,
  onSend,
  onActivate,
  placeholder,
  disabled,
  loading = false,
  collapsed = false,
}: {
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  onActivate?: () => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
  collapsed?: boolean;
}) {
  const canSend = chatInput.trim().length > 0 && !disabled;

  return (
    <div
      className={`chat-input-shell ${collapsed ? "chat-input-shell-collapsed" : ""}`}
      onMouseDown={() => {
        if (collapsed) onActivate?.();
      }}
    >
      <textarea
        value={chatInput}
        onChange={(e) => onChatInputChange(e.target.value)}
        onFocus={() => {
          if (collapsed) onActivate?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
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
          onClick={onSend}
          disabled={!canSend && !loading}
          className={`chat-send-btn ${loading ? "chat-send-btn-loading" : ""}`}
          aria-label={loading ? "Generating" : "Send message"}
        >
          {loading ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export { arioAvatar };
