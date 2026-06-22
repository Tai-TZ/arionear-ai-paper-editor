import { useCallback, useEffect, useRef, useState, forwardRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  AudioLines,
  ChevronDown,
  ChevronUp,
  Copy,
  Maximize2,
  PanelRightClose,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import arioAvatar from "../../assets/avatar/avatar-chat.png";
import { LlmSelector } from "@/components/llm-selector";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";
import { CHAT_SLASH_HINTS, filterSlashCommands, getSlashCommandQuery, slashCommandInsert, type SlashCommandDef } from "@/lib/chat-commands";
import { useChatStreamProgress, type ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import type { ChatAiStep, LLMProvider, ProviderInfo } from "@/lib/api/academic";
import { filterDisplaySteps } from "@/lib/api/academic";
import { AiLoadingState } from "@/components/ai-loading-state";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  activities?: string[];
  aiSteps?: ChatAiStep[];
  /** Latest SSE step label while streaming */
  streamLabel?: string;
  streamElapsedSec?: number | null;
  isStreaming?: boolean;
};

export function hasChatHistory(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "user");
}

const CHAT_DOCK_COLLAPSED_H = 92;
const CHAT_MIN_H = 320;
const CHAT_DEFAULT_RATIO = 0.62;
const CHAT_MAX_RATIO = 0.86;
const CHAT_HEIGHT_STORAGE_KEY = "ario-chat-panel-height";

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
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onRefreshProviders?: () => void;
  composerMode?: "normal" | "quick-edit";
  selectionContext?: EditorSelectionContext | null;
  onClearSelectionContext?: () => void;
  streamProgress?: ChatStreamProgressSnapshot;
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
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onRefreshProviders,
  composerMode = "normal",
  selectionContext = null,
  onClearSelectionContext,
  streamProgress: streamProgressProp,
}: ChatDockProps) {
  const subscribedProgress = useChatStreamProgress();
  const streamProgress = streamProgressProp ?? subscribedProgress;
  const { activity: liveActivity, steps: streamAiSteps, activities: streamActivities, waitElapsedSec } =
    streamProgress;
  const displaySteps = useMemo(() => filterDisplaySteps(streamAiSteps), [streamAiSteps]);
  const dockRef = useRef<HTMLElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [panelH, setPanelH] = useState(300);
  const lastPanelHRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const conversationStarted = hasChatHistory(messages);

  const clampHeight = useCallback((h: number) => {
    const max = dockRef.current?.parentElement
      ? Math.round(dockRef.current.parentElement.clientHeight * 0.86)
      : 480;
    return Math.min(Math.max(h, CHAT_MIN_H), Math.max(max, CHAT_MIN_H));
  }, []);

  const getMaxHeight = useCallback(() => {
    const parentH = dockRef.current?.parentElement?.clientHeight ?? 0;
    if (!parentH) return clampHeight(560);
    return clampHeight(Math.round(parentH * CHAT_MAX_RATIO));
  }, [clampHeight]);

  useEffect(() => {
    if (!open || initializedRef.current || !dockRef.current?.parentElement) return;
    initializedRef.current = true;
    const parentH = dockRef.current.parentElement.clientHeight;
    try {
      const saved = localStorage.getItem(CHAT_HEIGHT_STORAGE_KEY);
      if (saved) {
        const parsed = Number.parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          setPanelH(clampHeight(parsed));
          return;
        }
      }
    } catch {
      /* ignore storage errors */
    }
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
  }, [open, messages, chatLoading, liveActivity, displaySteps, chatEndRef]);

  const persistPanelHeight = useCallback((height: number) => {
    try {
      localStorage.setItem(CHAT_HEIGHT_STORAGE_KEY, String(height));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const startResize = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = panelH;

    const onMove = (ev: PointerEvent) => {
      setPanelH(clampHeight(startH + (startY - ev.clientY)));
    };
    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setPanelH((current) => {
        const clamped = clampHeight(current);
        persistPanelHeight(clamped);
        return clamped;
      });
    };

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const canUseLlm = Boolean(
    providers &&
      providers.length > 0 &&
      llmProvider &&
      llmModel &&
      onProviderChange &&
      onModelChange,
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
        : "Hỏi Ario… hoặc gõ / để chọn lệnh";

  return (
    <aside
      ref={dockRef}
      className="chat-dock shrink-0"
      data-open={open}
      style={open ? { height: panelH + CHAT_DOCK_COLLAPSED_H } : undefined}
    >
      {open && (
        <button
          type="button"
          className="chat-dock-resize-handle chat-dock-resize-handle--top"
          onPointerDown={startResize}
          aria-label="Kéo để đổi chiều cao chat"
        >
          <span className="chat-dock-resize-bar" />
        </button>
      )}

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
              aria-label="Mở rộng chat"
              onClick={() => {
                const maxH = getMaxHeight();
                if (Math.abs(panelH - maxH) <= 8 && lastPanelHRef.current) {
                  const restored = clampHeight(lastPanelHRef.current);
                  setPanelH(restored);
                  persistPanelHeight(restored);
                  lastPanelHRef.current = null;
                  return;
                }
                lastPanelHRef.current = panelH;
                setPanelH(maxH);
                persistPanelHeight(maxH);
              }}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
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
            streamProgress={streamProgress}
          />
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
          <AiLoadingState
            compact
            steps={displaySteps}
            activities={streamActivities}
            activity={liveActivity}
            waitElapsedSec={waitElapsedSec}
          />
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
      message.streamLabel?.trim() ||
      (message.activities?.length ?? 0) > 0 ||
      filterDisplaySteps(message.aiSteps ?? []).length > 0,
  );
}

export function ChatProgressStrip(props: {
  activity?: string | null;
  steps: ChatAiStep[];
  activities?: string[];
  waitElapsedSec?: number | null;
}) {
  return <AiLoadingState compact {...props} />;
}

function ChatAiStatePanel(props: {
  steps: ChatAiStep[];
  activities?: string[];
  activity?: string | null;
  waitElapsedSec?: number | null;
}) {
  return <AiLoadingState {...props} />;
}

export function ChatMessages({
  messages,
  chatEndRef,
  chatLoading,
  streamProgress: streamProgressProp,
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  streamProgress?: ChatStreamProgressSnapshot;
}) {
  const hookProgress = useChatStreamProgress();
  const progress = streamProgressProp ?? hookProgress;
  const liveActivity = progress.activity;
  const waitElapsedSec = progress.waitElapsedSec;
  const visibleMessages = messages.filter(
    (m) => m.role === "user" || assistantHasBody(m) || m.isStreaming,
  );

  return (
    <div className="soft-scrollbar chat-messages flex-1 overflow-y-auto px-4 py-3">
      {visibleMessages.length === 0 && !chatLoading && (
        <p className="chat-dock-empty-hint">
          Chọn provider và model phía dưới. Gõ lệnh nhanh: {CHAT_SLASH_HINTS.join(", ")}.
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
        const isStreamingAssistant = Boolean(isLast && m.isStreaming);
        const liveSteps = m.aiSteps ?? [];
        const liveActivities = m.activities ?? [];
        const hasAiSteps = filterDisplaySteps(liveSteps).length > 0;
        const hasActivities = liveActivities.length > 0;
        const hasLiveProgress = Boolean(
          isStreamingAssistant &&
            (m.streamLabel || liveActivity || hasAiSteps || hasActivities || chatLoading),
        );
        const showLoadingState = Boolean(
          isStreamingAssistant && (hasLiveProgress || chatLoading) && !m.content,
        );

        return (
          <div key={i} className="chat-message-row chat-assistant-row">
            <img src={arioAvatar} alt="Ario" className="chat-avatar shrink-0" />
            <div className="chat-assistant-content min-w-0 flex-1">
              {showLoadingState && (
                <ChatAiStatePanel
                  steps={liveSteps}
                  activities={liveActivities}
                  activity={m.streamLabel ?? liveActivity}
                />
              )}
              {m.content && (
                <div className="chat-assistant-text">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
              {m.isStreaming && m.content && (
                <span className="chat-stream-cursor" aria-hidden />
              )}
            </div>
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
  const [highlightIndex, setHighlightIndex] = useState(0);
  const internalRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const slashQuery = useMemo(() => getSlashCommandQuery(chatInput), [chatInput]);
  const filteredCommands = useMemo(
    () => (slashQuery !== null ? filterSlashCommands(slashQuery) : []),
    [slashQuery],
  );
  const showSlashMenu =
    !disabled && slashQuery !== null && filteredCommands.length > 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [slashQuery, filteredCommands.length]);

  const applySlashCommand = useCallback(
    (cmd: SlashCommandDef) => {
      onChatInputChange(slashCommandInsert(cmd.command));
      requestAnimationFrame(() => {
        const el = internalRef.current;
        el?.focus();
        const len = el?.value.length ?? 0;
        el?.setSelectionRange(len, len);
      });
    },
    [onChatInputChange],
  );

  const canSend = chatInput.trim().length > 0 && !disabled;

  const handlePrimaryAction = () => {
    if (loading) {
      onStop?.();
      return;
    }
    onSend();
  };

  return (
    <div className="chat-input-wrap">
      {showSlashMenu && (
        <div
          className="chat-slash-menu soft-scrollbar"
          role="listbox"
          aria-label="Lệnh chat"
        >
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.command}
              type="button"
              role="option"
              aria-selected={index === highlightIndex}
              className={`chat-slash-menu-item${index === highlightIndex ? " chat-slash-menu-item--active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySlashCommand(cmd);
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              <img src={arioAvatar} alt="" className="chat-slash-menu-icon" />
              <span className="chat-slash-menu-body">
                <span className="chat-slash-menu-cmd">/{cmd.command}</span>
                <span className="chat-slash-menu-desc">{cmd.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-shell">
        <textarea
          ref={setRefs}
          value={chatInput}
          onChange={(e) => onChatInputChange(e.target.value)}
          onFocus={() => onActivate?.()}
          onKeyDown={(e) => {
            if (showSlashMenu) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                applySlashCommand(filteredCommands[highlightIndex] ?? filteredCommands[0]);
                return;
              }
              if (e.key === "Tab") {
                e.preventDefault();
                applySlashCommand(filteredCommands[highlightIndex] ?? filteredCommands[0]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onChatInputChange("");
                return;
              }
            }
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
    </div>
  );
});

export { arioAvatar };
