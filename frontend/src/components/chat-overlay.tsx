import { useCallback, useEffect, useLayoutEffect, useRef, useState, forwardRef, useMemo } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Maximize2,
  Sparkles,
  Square,
  X,
} from "lucide-react";

import arioAvatar from "../../assets/avatar/avatar-chat.png";
import { LlmSelector } from "@/components/llm-selector";
import { useLocale } from "@/components/locale-provider";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";
import { filterSlashCommands, getSlashCommandQuery, slashCommandInsert, type SlashCommandDef } from "@/lib/chat-commands";
import { getChatSlashHints } from "@/lib/chat-commands-i18n";
import { useChatStreamProgress, type ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import type { ChatAiStep, LLMProvider, ProviderInfo } from "@/lib/api/academic";
import { filterDisplaySteps } from "@/lib/api/academic";
import { editorCopy } from "@/lib/editor-i18n";
import { isSelectedModelPaid } from "@/lib/llm-model-tier";
import { AiLoadingState } from "@/components/ai-loading-state";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  activities?: string[];
  aiSteps?: ChatAiStep[];
  /** Latest SSE step label while streaming */
  streamLabel?: string;
  streamElapsedSec?: number | null;
  isStreaming?: boolean;
  isError?: boolean;
};

export function hasChatHistory(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "user");
}

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
  onNewChat?: () => void;
  composerMode?: "normal" | "quick-edit";
  selectionContext?: EditorSelectionContext | null;
  onClearSelectionContext?: () => void;
  streamProgress?: ChatStreamProgressSnapshot;
  composerHint?: string | null;
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
  onNewChat,
  composerMode = "normal",
  selectionContext = null,
  onClearSelectionContext,
  streamProgress: streamProgressProp,
  composerHint = null,
}: ChatDockProps) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const subscribedProgress = useChatStreamProgress();
  const streamProgress = streamProgressProp ?? subscribedProgress;
  const { activity: liveActivity, steps: streamAiSteps, activities: streamActivities, waitElapsedSec } =
    streamProgress;
  const displaySteps = useMemo(() => filterDisplaySteps(streamAiSteps), [streamAiSteps]);
  const dockRef = useRef<HTMLElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [panelH, setPanelH] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
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
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      setPanelH(clampHeight(startH + (startY - ev.clientY)));
    };
    const finish = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setIsResizing(false);
      setPanelH((current) => {
        const clamped = clampHeight(current);
        persistPanelHeight(clamped);
        return clamped;
      });
    };

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };

  const canUseLlm = Boolean(
    providers &&
      providers.length > 0 &&
      llmProvider &&
      llmModel &&
      onProviderChange &&
      onModelChange,
  );

  const paidModelSelected =
    canUseLlm && isSelectedModelPaid(providers!, llmProvider!, llmModel!);

  const chatDisabled = !canUseLlm || paidModelSelected;

  const handleSend = () => {
    if (!chatInput.trim() || chatLoading || chatDisabled) return;
    onSend();
  };

  const openFromComposer = () => {
    if (!open && conversationStarted) onOpen();
  };

  const placeholder = !canUseLlm
    ? t.chatDock.placeholderNoProvider
    : paidModelSelected
      ? t.llm.paidChatPlaceholder
      : composerMode === "quick-edit"
        ? t.chatDock.placeholderQuickEdit
        : selectionContext
          ? t.chatDock.placeholderSelection
          : t.chatDock.placeholderDefault;

  return (
    <aside
      ref={dockRef}
      className="chat-dock shrink-0"
      data-open={open}
      data-resizing={isResizing}
      style={{ "--chat-dock-panel-h": open ? `${panelH}px` : "0px" } as React.CSSProperties}
    >
      <div className="chat-dock-panel-wrap" aria-hidden={!open}>
        <button
          type="button"
          className="chat-dock-resize-handle chat-dock-resize-handle--top"
          onPointerDown={startResize}
          aria-label={t.chatDock.resizeChat}
          tabIndex={open ? 0 : -1}
        >
          <span className="chat-dock-resize-bar" />
        </button>

        <div className="chat-dock-panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="chat-dock-toolbar shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="chat-dock-icon-btn"
              aria-label={t.chatDock.collapseChat}
              tabIndex={open ? 0 : -1}
            >
              <ChevronDown className="chat-dock-collapse-icon h-4 w-4" />
            </button>
            <div className="chat-dock-title">
              <img src={arioAvatar} alt="" className="chat-dock-title-avatar" />
              <span>Ario</span>
            </div>
            <div className="flex-1" />
            <button
              type="button"
              className="chat-dock-icon-btn"
              aria-label={t.chatDock.expandChat}
              tabIndex={open ? 0 : -1}
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
          </div>

          <ChatMessages
            messages={messages}
            chatEndRef={chatEndRef}
            chatLoading={chatLoading}
            streamProgress={streamProgress}
          />
        </div>
      </div>

      <div className="chat-dock-composer shrink-0">
        {!open && conversationStarted && !chatLoading && (
          <button type="button" className="chat-dock-expand-btn" onClick={onOpen}>
            <ChevronUp className="chat-dock-expand-icon h-3.5 w-3.5" />
            <span>{t.chatDock.openChat}</span>
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

        {composerHint && !chatLoading && (
          <p className="chat-composer-hint px-3 pb-1 text-[11px] leading-snug text-muted-foreground">
            {composerHint}
          </p>
        )}

        {composerMode === "quick-edit" && (
          <div className="chat-quick-edit-banner" role="status">
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t.chatDock.quickEditBanner}</span>
          </div>
        )}

        {selectionContext && (
          <div className="chat-selection-chip">
            <span className="chat-selection-chip-label">
              {selectionContext.lineStart === selectionContext.lineEnd
                ? t.chatDock.selectionLine(selectionContext.lineStart)
                : t.chatDock.selectionLineRange(
                    selectionContext.lineStart,
                    selectionContext.lineEnd,
                  )}
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
                  aria-label={t.chatDock.clearSelection}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="chat-dock-llm-bar">
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

        {paidModelSelected && (
          <p className="chat-paid-model-hint" role="status">
            {t.llm.paidChatHint}
          </p>
        )}

        <ChatInput
          ref={chatInputRef}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          onSend={handleSend}
          onStop={onStop}
          onActivate={openFromComposer}
          disabled={chatDisabled}
          loading={chatLoading}
          placeholder={placeholder}
        />
      </div>
    </aside>
  );
}

function ChatCopyButton({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1000);
  }, [text]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <button
      type="button"
      className={cn("chat-copy-btn", copied && "chat-copy-btn-copied")}
      aria-label={ariaLabel}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
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
  const { locale } = useLocale();
  const t = editorCopy(locale);
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
          {t.chatDock.emptySlashHint(getChatSlashHints(locale).join(", "))}
        </p>
      )}

      {visibleMessages.map((m, i) => {
        if (m.role === "user") {
          return (
            <div key={i} className="chat-message-row chat-user-row">
              <div className="chat-user-stack">
                <div className="chat-bubble chat-bubble-user-dark">{m.content}</div>
                <ChatCopyButton text={m.content} ariaLabel={t.chatDock.copyMessage} />
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
          isStreamingAssistant && hasLiveProgress && !m.content && !m.isError,
        );

        return (
          <div key={i} className="chat-message-row chat-assistant-row">
            <img src={arioAvatar} alt="Ario" className="chat-avatar shrink-0" />
            <div className="chat-assistant-content min-w-0 flex-1">
              {m.reasoning?.trim() ? (
                <details className="chat-reasoning-panel mb-2" open={Boolean(m.isStreaming)}>
                  <summary className="chat-reasoning-title cursor-pointer select-none">
                    {t.chatDock.reasoningTitle}
                  </summary>
                  <div className="chat-reasoning-block mt-1 max-h-40 overflow-y-auto text-xs text-muted-foreground whitespace-pre-wrap">
                    {m.reasoning}
                  </div>
                </details>
              ) : null}
              {showLoadingState && (
                <ChatAiStatePanel
                  steps={liveSteps}
                  activities={liveActivities}
                  activity={m.streamLabel ?? liveActivity}
                  waitElapsedSec={m.streamElapsedSec}
                />
              )}
              {m.content && (
                <div
                  className={cn(
                    "chat-assistant-text",
                    m.isError && "chat-assistant-text-error",
                  )}
                >
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

const SLASH_MENU_GAP_PX = 6;
const SLASH_MENU_MAX_HEIGHT_PX = 256;

function useSlashMenuPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLTextAreaElement | null>,
  itemCount: number,
) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!open || !el) {
      setStyle({ visibility: "hidden" });
      return;
    }
    const rect = el.getBoundingClientRect();
    const estimatedHeight = Math.min(
      SLASH_MENU_MAX_HEIGHT_PX,
      Math.max(112, itemCount * 56),
    );
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceAbove >= estimatedHeight || spaceAbove >= spaceBelow;

    if (openUpward) {
      setStyle({
        position: "fixed",
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        bottom: `${window.innerHeight - rect.top + SLASH_MENU_GAP_PX}px`,
        maxHeight: `${Math.max(96, Math.min(SLASH_MENU_MAX_HEIGHT_PX, spaceAbove - SLASH_MENU_GAP_PX - 8))}px`,
        visibility: "visible",
      });
      return;
    }

    setStyle({
      position: "fixed",
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      top: `${rect.bottom + SLASH_MENU_GAP_PX}px`,
      maxHeight: `${Math.max(96, Math.min(SLASH_MENU_MAX_HEIGHT_PX, spaceBelow - SLASH_MENU_GAP_PX - 8))}px`,
      visibility: "visible",
    });
  }, [open, anchorRef, itemCount]);

  useLayoutEffect(() => {
    update();
    if (!open) return;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  return style;
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
  const { locale } = useLocale();
  const t = editorCopy(locale);
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
    () => (slashQuery !== null ? filterSlashCommands(slashQuery, locale) : []),
    [slashQuery, locale],
  );
  const showSlashMenu =
    !disabled && slashQuery !== null && filteredCommands.length > 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [slashQuery, filteredCommands.length]);

  const applySlashCommand = useCallback(
    (cmd: SlashCommandDef) => {
      onChatInputChange(slashCommandInsert(cmd));
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
  const slashMenuStyle = useSlashMenuPosition(showSlashMenu, internalRef, filteredCommands.length);

  const slashMenu =
    showSlashMenu &&
    createPortal(
      <div
        className="chat-slash-menu chat-slash-menu--portaled soft-scrollbar"
        style={slashMenuStyle}
        role="listbox"
        aria-label="Lệnh chat"
      >
        {filteredCommands.map((cmd, index) => (
          <button
            key={`${cmd.command}-${cmd.task}`}
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
              {cmd.detail ? (
                <span className="chat-slash-menu-detail">{cmd.detail}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>,
      document.body,
    );

  const handlePrimaryAction = () => {
    if (loading) {
      onStop?.();
      return;
    }
    if (disabled) return;
    onSend();
  };

  return (
    <div className={cn("chat-input-wrap", disabled && "chat-input-wrap--disabled")}>
      {slashMenu}

      <div className="chat-input-shell">
        <textarea
          ref={setRefs}
          value={chatInput}
          disabled={disabled}
          onChange={(e) => {
            if (disabled) return;
            onChatInputChange(e.target.value);
          }}
          onFocus={() => {
            if (!disabled) onActivate?.();
          }}
          onKeyDown={(e) => {
            if (disabled) return;
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
              if (!loading && !disabled) onSend();
            }
          }}
          placeholder={placeholder}
          rows={1}
          className="chat-input-field"
        />
        <div className="chat-input-actions">
          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={!loading && (!canSend || disabled)}
            className={`chat-send-btn ${loading ? "chat-send-btn-loading" : ""}`}
            aria-label={loading ? t.chatDock.stopProcessing : t.chatDock.sendMessage}
          >
            {loading ? <Square className="h-3 w-3 fill-current" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
});

export { arioAvatar };
