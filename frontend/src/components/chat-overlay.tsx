import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, ChevronDown, ChevronUp, Maximize2, PencilLine, Square, X } from "lucide-react";

import { nibAvatar } from "@/lib/nib-avatar";
import { LlmSelector } from "@/components/llm-selector";
import { useLocale } from "@/components/locale-context";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";
import {
  filterSlashCommands,
  getSlashCommandQuery,
  slashCommandInsert,
  type SlashCommandDef,
} from "@/lib/chat-commands";
import { getChatSlashHints } from "@/lib/chat-commands-i18n";
import { useChatStreamProgress, type ChatStreamProgressSnapshot } from "@/lib/chat-stream-progress";
import type { ChatAiStep, LLMProvider, ProviderInfo } from "@/lib/api/academic";
import { filterDisplaySteps } from "@/lib/api/academic";
import { editorCopy } from "@/lib/editor-i18n";
import { useMarkdownMath } from "@/lib/markdown-math";
import { AiLoadingState } from "@/components/ai-loading-state";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  /** Stable React key; in-memory only (stored threads keep role/content). */
  id?: string;
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

function hasChatHistory(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === "user");
}

/** Floor while dragging — keep toolbar + a few message lines readable. */
const CHAT_MIN_H = 160;
const CHAT_DEFAULT_RATIO = 0.62;
const CHAT_MAX_RATIO = 0.86;
const CHAT_HEIGHT_STORAGE_KEY = "nib-chat-panel-height";

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

function ChatDock({
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
  const {
    activity: liveActivity,
    steps: streamAiSteps,
    activities: streamActivities,
    waitElapsedSec,
  } = streamProgress;
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

  // Opening the dock reveals the latest message; while it is open, ChatMessages keeps following
  // new content only when the user is already at the bottom.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, chatEndRef]);

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

  const chatDisabled = !canUseLlm;

  const handleSend = () => {
    if (!chatInput.trim() || chatLoading || chatDisabled) return;
    onSend();
  };

  const openFromComposer = () => {
    if (!open && conversationStarted) onOpen();
  };

  const placeholder = !canUseLlm
    ? t.chatDock.placeholderNoProvider
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
              <img src={nibAvatar} alt="" className="chat-dock-title-avatar" />
              <span>Nib</span>
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
            <PencilLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
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

function assistantHasBody(message: ChatMessage): boolean {
  return Boolean(
    message.content?.trim() ||
    message.streamLabel?.trim() ||
    (message.activities?.length ?? 0) > 0 ||
    filterDisplaySteps(message.aiSteps ?? []).length > 0,
  );
}

function ChatAiStatePanel(props: {
  steps: ChatAiStep[];
  activities?: string[];
  activity?: string | null;
  waitElapsedSec?: number | null;
  compact?: boolean;
}) {
  return <AiLoadingState {...props} />;
}

const REMARK_PLUGINS = [remarkGfm];

/**
 * Markdown is the costly part of a message; re-parse only when its text changes (or when the reply
 * finishes streaming). Math (`$…$`, KaTeX) renders only on finished replies — see useMarkdownMath.
 */
const ChatMarkdown = memo(function ChatMarkdown({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const math = useMarkdownMath(content, !isStreaming);
  return (
    <ReactMarkdown
      remarkPlugins={math?.remarkPlugins ?? REMARK_PLUGINS}
      rehypePlugins={math?.rehypePlugins}
    >
      {content}
    </ReactMarkdown>
  );
});

/**
 * One chat message. Memoized so a streamed token re-renders only the reply being streamed; the
 * live-progress props are passed to that reply only and stay constant for every other message.
 */
const ChatMessageRow = memo(function ChatMessageRow({
  message: m,
  isStreamingAssistant,
  liveActivity,
  chatLoading,
  surface,
  reasoningTitle,
}: {
  message: ChatMessage;
  isStreamingAssistant: boolean;
  liveActivity: string | null;
  chatLoading: boolean;
  surface: "dock" | "sheet";
  reasoningTitle: string;
}) {
  if (m.role === "user") {
    return (
      <div className="chat-message-row chat-user-row">
        <div className="chat-user-stack">
          <div className="chat-bubble chat-bubble-user-dark">{m.content}</div>
        </div>
      </div>
    );
  }

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
    <div className="chat-message-row chat-assistant-row">
      <img src={nibAvatar} alt="Nib" className="chat-avatar shrink-0" />
      <div className="chat-assistant-content min-w-0 flex-1">
        {m.reasoning?.trim() ? (
          <details className="chat-reasoning-panel mb-2" open={Boolean(m.isStreaming)}>
            <summary className="chat-reasoning-title cursor-pointer select-none">
              {reasoningTitle}
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
            compact={surface === "sheet"}
          />
        )}
        {m.content && (
          <div className={cn("chat-assistant-text", m.isError && "chat-assistant-text-error")}>
            <ChatMarkdown content={m.content} isStreaming={Boolean(m.isStreaming)} />
          </div>
        )}
        {m.isStreaming && m.content && <span className="chat-stream-cursor" aria-hidden />}
      </div>
    </div>
  );
});

/** Distance from the bottom (px) within which the list keeps following new content. */
const STICK_TO_BOTTOM_PX = 80;

export function ChatMessages({
  messages,
  chatEndRef,
  chatLoading,
  streamProgress: streamProgressProp,
  surface = "dock",
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  streamProgress?: ChatStreamProgressSnapshot;
  surface?: "dock" | "sheet";
}) {
  const { locale } = useLocale();
  const t = editorCopy(locale);
  const hookProgress = useChatStreamProgress();
  const progress = streamProgressProp ?? hookProgress;
  const liveActivity = progress.activity;
  const visibleMessages = messages.filter(
    (m) => m.role === "user" || assistantHasBody(m) || m.isStreaming,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  const hasScrolledRef = useRef(false);
  const userMessageCount = messages.reduce((n, m) => (m.role === "user" ? n + 1 : n), 0);
  const threadKey = messages[0]?.id;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    if (el.scrollHeight - top - el.clientHeight <= STICK_TO_BOTTOM_PX) {
      stickToBottomRef.current = true;
    } else if (top < lastScrollTopRef.current) {
      // Only an upward scroll detaches; content growing below the viewport does not.
      stickToBottomRef.current = false;
    }
    lastScrollTopRef.current = top;
  }, []);

  // A new user turn (or another thread) always brings the conversation back to the bottom.
  useLayoutEffect(() => {
    stickToBottomRef.current = true;
  }, [userMessageCount, threadKey]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottomRef.current) return;
    if (chatLoading || !hasScrolledRef.current) {
      // Instant while streaming: a smooth scroll restarted on every frame only lags and stutters.
      el.scrollTop = el.scrollHeight;
      // Record it now so the next user scroll is compared against this position, even when the
      // browser coalesces our scroll event with the user's.
      lastScrollTopRef.current = el.scrollTop;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    hasScrolledRef.current = true;
  }, [messages, chatLoading, progress]);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="soft-scrollbar chat-messages flex-1 overflow-y-auto px-4 py-3"
      data-surface={surface}
    >
      {visibleMessages.length === 0 && !chatLoading && (
        <p className="chat-dock-empty-hint">
          {t.chatDock.emptySlashHint(getChatSlashHints(locale).join(", "))}
        </p>
      )}

      {visibleMessages.map((m, i) => {
        const isStreamingAssistant = Boolean(
          m.role === "assistant" && i === visibleMessages.length - 1 && m.isStreaming,
        );
        return (
          <ChatMessageRow
            key={m.id ?? `index-${i}`}
            message={m}
            isStreamingAssistant={isStreamingAssistant}
            liveActivity={isStreamingAssistant ? liveActivity : null}
            chatLoading={isStreamingAssistant ? Boolean(chatLoading) : false}
            surface={surface}
            reasoningTitle={t.chatDock.reasoningTitle}
          />
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
    const estimatedHeight = Math.min(SLASH_MENU_MAX_HEIGHT_PX, Math.max(112, itemCount * 56));
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

export const ChatInput = forwardRef<
  HTMLTextAreaElement,
  {
    chatInput: string;
    onChatInputChange: (v: string) => void;
    onSend: () => void;
    onStop?: () => void;
    onActivate?: () => void;
    placeholder: string;
    disabled?: boolean;
    loading?: boolean;
  }
>(function ChatInput(
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
  const showSlashMenu = !disabled && slashQuery !== null && filteredCommands.length > 0;

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
            <img src={nibAvatar} alt="" className="chat-slash-menu-icon" />
            <span className="chat-slash-menu-body">
              <span className="chat-slash-menu-cmd">/{cmd.command}</span>
              <span className="chat-slash-menu-desc">{cmd.description}</span>
              {cmd.detail ? <span className="chat-slash-menu-detail">{cmd.detail}</span> : null}
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
            // IME composition (Vietnamese, CJK…): Enter picks the candidate, it must not submit.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
            {loading ? (
              <Square className="h-3 w-3 fill-current" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
