import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ChatMessage } from "@/components/chat-overlay";
import { editorCopy } from "@/lib/editor-i18n";
import {
  appendImportantFeedLine,
  applyAiState,
  CHAT_CONTENT_RESYNC_CODE,
  filterDisplaySteps,
  isImportantFeedEvent,
  isProgressNoiseActivity,
  isProgressNoiseStep,
  revisionAction,
  streamChat,
  syncSession,
  type ChatAiStatePayload,
  type ChatResult,
  type LLMProvider,
  type LogicAuditReport,
  type ProviderInfo,
} from "@/lib/api/academic";
import { llmUserErrorMsg } from "@/lib/api/api-errors";
import { isCasualChatMessage, parseChatSlashCommand } from "@/lib/chat-commands";
import { buildConversationHistory } from "@/lib/chat-history";
import {
  finishChatStreamProgress,
  getChatStreamProgressSnapshot,
  pushChatStreamActivity,
  pushChatStreamState,
  resetChatStreamProgress,
  type ChatStreamProgressSnapshot,
} from "@/lib/chat-stream-progress";
import type { EditorSelectionContext } from "@/lib/editor-selection-anchor";
import { clampSelectionReplacement } from "@/lib/inline-suggestion";
import { pickFirstFreeModel } from "@/lib/llm-model-tier";
import { canApplyPendingEdit, contentFingerprint } from "@/lib/pending-edit-utils";
import { hasBlockingIntegrityFlags } from "@/lib/integrity-flags";
import { agentChatStreamTimeoutMs } from "@/lib/agent-chat-timeout";
import { parseLatexOutline } from "@/lib/latex-outline";
import { buildEditRedoPrompt, type StructureSuggestion } from "@/lib/structure-suggestions";
import { logicAuditFingerprint } from "@/lib/paper-score-audit";
import type { ChatThread, ProjectFile, StoredChatMessage } from "@/lib/project-store";
import type { UiLanguage, ResearcherProfile } from "@/lib/researcher-profile";
import {
  listLogicAuditSectionOptions,
  logicAuditClientTimeoutMs,
  logicAuditTargetSectionCount,
  mergeLogicSectionReport,
  type LogicAuditMode,
  type LogicAuditScope,
} from "@/lib/logic-audit";
import { createSmoothStream, type SmoothStreamController } from "@/lib/smooth-stream";
import { toast } from "sonner";
import type { PendingEdit, PendingSuggestion, ToolsTab } from "../types";
import { applySingleEdit, applyEditToProjectFiles, suggestionToPendingEdit } from "../lib/editor-edit-apply";
import {
  buildChatLatexPayload,
  nextChatLatexSync,
  resetChatLatexSync,
  type ChatLatexSyncState,
} from "../lib/editor-chat-payload";
import {
  getPersistedThreads,
  isPersistedThread,
  makeInitialMessages,
  persistChatThreads,
  snapshotActiveThread,
  stripMessagesForStorage,
  threadHasUserMessages,
} from "../lib/editor-thread-storage";

export type EditorChatSideEffects = {
  setToolsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setToolsTab: React.Dispatch<React.SetStateAction<ToolsTab>>;
  setLogicAuditReport: React.Dispatch<React.SetStateAction<LogicAuditReport | null>>;
  setCitationResults: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>;
  setCitationSummary: React.Dispatch<React.SetStateAction<string>>;
  setStructureSuggestions: React.Dispatch<React.SetStateAction<StructureSuggestion[]>>;
  lastPanelAuditFingerprintRef: React.MutableRefObject<string | null>;
};

export type UseEditorChatOptions = {
  projectId: string | undefined;
  projectName: string;
  locale: UiLanguage;
  latex: string;
  mainFile: string;
  activeFile: string;
  mainLatexSource: string;
  projectFiles: ProjectFile[];
  selection: string;
  setSelection: React.Dispatch<React.SetStateAction<string>>;
  integrityStrictness: ResearcherProfile["integrity_strictness"];
  llmProvider: LLMProvider;
  llmModel: string;
  providers: ProviderInfo[];
  setLlmProvider: (p: LLMProvider) => void;
  setLlmModel: (m: string) => void;
  autoCompile: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  recordNow: (latex: string) => void;
  setProjectFiles: React.Dispatch<React.SetStateAction<ProjectFile[]>>;
  persistActiveFile: (content: string, files: ProjectFile[], currentActive: string) => ProjectFile[];
  refreshRevisions: () => void;
  scheduleCompile: (latexOverride?: string) => void;
  /** Immediate compile (bypass debounce) — used after accepting agent edits. */
  compileNow?: (latexOverride?: string) => void | Promise<unknown>;
  /** Called when compile is triggered right after accepting an edit (for PDF feedback). */
  onCompileAfterEdit?: () => void;
  /** Called after the user accepts an agent edit (persist project when auto-save is on). */
  onAfterEditAccepted?: () => void;
  setMobileChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  scoreAuditLoading?: boolean;
  sideEffects: EditorChatSideEffects;
};

export function useEditorChat(options: UseEditorChatOptions) {
  const {
    projectId,
    projectName,
    locale,
    latex,
    mainFile,
    activeFile,
    mainLatexSource,
    projectFiles,
    selection,
    setSelection,
    integrityStrictness,
    llmProvider,
    llmModel,
    providers,
    setLlmProvider,
    setLlmModel,
    autoCompile,
    undo,
    redo,
    canUndo,
    canRedo,
    recordNow,
    setProjectFiles,
    persistActiveFile,
    refreshRevisions,
    scheduleCompile,
    compileNow,
    onCompileAfterEdit,
    onAfterEditAccepted,
    setMobileChatOpen,
    scoreAuditLoading = false,
    sideEffects,
  } = options;

  const t = useMemo(() => editorCopy(locale), [locale]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => makeInitialMessages(locale));
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const chatThreadsRef = useRef<ChatThread[]>([]);
  chatThreadsRef.current = chatThreads;
  const activeChatIdRef = useRef<string>("");
  activeChatIdRef.current = activeChatId;
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [auditInProgress, setAuditInProgress] = useState(false);
  const [auditSectionProgress, setAuditSectionProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [chatStreamProgress, setChatStreamProgress] = useState<ChatStreamProgressSnapshot>(
    getChatStreamProgressSnapshot(),
  );
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatSmoothStreamRef = useRef<SmoothStreamController | null>(null);
  const [chatSelectionContext, setChatSelectionContext] = useState<EditorSelectionContext | null>(
    null,
  );
  const [chatComposerMode, setChatComposerMode] = useState<"normal" | "quick-edit">("normal");
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[] | null>(null);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const pendingEditsRef = useRef<PendingEdit[] | null>(null);
  pendingEditsRef.current = pendingEdits;
  const activeEditIdRef = useRef<string | null>(null);
  activeEditIdRef.current = activeEditId;

  const chatEndRef = useRef<HTMLDivElement>(null);
  const latexSyncRef = useRef<ChatLatexSyncState>(resetChatLatexSync());
  const logicAuditLaunchRef = useRef<{
    mode: LogicAuditMode;
    scope: LogicAuditScope;
    sections: string[];
    userDisplay: string;
    message: string;
    targetSectionCount: number;
  } | null>(null);
  const agentEditLaunchRef = useRef<{ message: string; userDisplay: string } | null>(null);
  const logicAuditPartialCountRef = useRef(0);

  const runCompileAfterEdit = useCallback(
    (latexOverride?: string) => {
      if (!autoCompile) return;
      onCompileAfterEdit?.();
      if (compileNow) {
        void compileNow(latexOverride);
        return;
      }
      scheduleCompile(latexOverride);
    },
    [autoCompile, compileNow, onCompileAfterEdit, scheduleCompile],
  );

  const skipNextEditPersistRef = useRef(true);

  const flushPendingEditsToThread = useCallback((): ChatThread[] => {
    const threadId = activeChatIdRef.current;
    if (!threadId) return chatThreadsRef.current;
    const edits = pendingEditsRef.current;
    const editId = activeEditIdRef.current;
    const updated = chatThreadsRef.current.map((th) =>
      th.id === threadId
        ? {
            ...th,
            pendingEdits: edits?.length ? edits : undefined,
            activeEditId: editId ?? undefined,
            updatedAt: Date.now(),
          }
        : th,
    );
    chatThreadsRef.current = updated;
    setChatThreads(updated);
    return updated;
  }, []);

  const restorePendingFromThread = useCallback((threadId: string) => {
    const thread = chatThreadsRef.current.find((th) => th.id === threadId);
    setPendingEdits(thread?.pendingEdits?.length ? thread.pendingEdits : null);
    setActiveEditId(thread?.activeEditId ?? null);
  }, []);

  const sendCtxRef = useRef({
    chatInput: "",
    chatLoading: false,
    selection: "",
    chatSelectionContext: null as EditorSelectionContext | null,
    chatComposerMode: "normal" as "normal" | "quick-edit",
    latex: "",
    mainLatexSource: "",
    projectFiles: [] as ProjectFile[],
    activeFile: "",
    mainFile: "",
    llmProvider: "" as LLMProvider | "",
    llmModel: "",
    providers: [] as ProviderInfo[],
    integrityStrictness: "strict" as ResearcherProfile["integrity_strictness"],
  });

  sendCtxRef.current = {
    chatInput,
    chatLoading,
    selection,
    chatSelectionContext,
    chatComposerMode,
    latex,
    mainLatexSource,
    projectFiles,
    activeFile,
    mainFile,
    llmProvider,
    llmModel,
    providers,
    integrityStrictness,
  };

  const onChatPersistError = useCallback(() => {
    toast.error(t.errors.chatPersistFailed);
  }, [t.errors.chatPersistFailed]);

  const reportRevisionAction = useCallback(
    (revisionId: string | undefined, action: "accepted" | "rejected") => {
      if (!projectId || !revisionId) return;
      void revisionAction(projectId, revisionId, action)
        .then(() => refreshRevisions())
        .catch(() => toast.error(t.errors.revisionFailed));
    },
    [projectId, refreshRevisions, t.errors.revisionFailed],
  );

  // ── Chat thread helpers ──────────────────────────────────────────────────

  function makeThread(title: string): ChatThread {
    const now = Date.now();
    return { id: crypto.randomUUID(), title, messages: [], createdAt: now, updatedAt: now };
  }

  function stripMessages(msgs: ChatMessage[]): StoredChatMessage[] {
    return stripMessagesForStorage(msgs);
  }

  function restoreMessages(thread: ChatThread): ChatMessage[] {
    if (!thread.messages.length) return makeInitialMessages(locale);
    return [
      makeInitialMessages(locale)[0],
      ...thread.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.isError ? { isError: true } : {}),
      })),
    ];
  }

  const persistActiveThreadNow = useCallback(
    (msgs?: ChatMessage[]) => {
      const payload = msgs ?? messagesRef.current;
      if (!projectId || !activeChatIdRef.current || !threadHasUserMessages(payload)) return;
      const stored = stripMessages(payload);
      const updated = chatThreadsRef.current.map((th) =>
        th.id === activeChatIdRef.current
          ? { ...th, messages: stored, updatedAt: Date.now() }
          : th,
      );
      chatThreadsRef.current = updated;
      setChatThreads(updated);
      persistChatThreads(projectId, updated, onChatPersistError);
    },
    [projectId, onChatPersistError],
  );

  const handleStopChat = useCallback(() => {
    if (!chatAbortRef.current) return;
    chatAbortRef.current.abort();
    setChatLoading(false);
    setAuditInProgress(false);
    setAuditSectionProgress(null);
    resetChatStreamProgress();
    setMessages((prev) => {
      const idx = prev.findLastIndex((m) => m.role === "assistant" && m.isStreaming);
      if (idx === -1) return prev;
      const next = [...prev];
      const msg = next[idx] as ChatMessage;
      next[idx] = {
        ...msg,
        isStreaming: false,
        content: msg.content.trim() || t.chatStream.stopped,
      };
      return next;
    });
  }, [t.chatStream.stopped]);

  const handleNewChat = useCallback(() => {
    handleStopChat();
    flushPendingEditsToThread();
    if (!threadHasUserMessages(messages)) {
      setMessages(makeInitialMessages(locale));
      setChatInput("");
      restorePendingFromThread(activeChatIdRef.current);
      return;
    }
    const tCopy = editorCopy(locale);
    const snapshotted = snapshotActiveThread(
      chatThreadsRef.current,
      activeChatIdRef.current,
      messages,
    );
    const newThread = makeThread(tCopy.sidebar.defaultChatTitle);
    setChatThreads([newThread, ...getPersistedThreads(snapshotted)]);
    setActiveChatId(newThread.id);
    setMessages(makeInitialMessages(locale));
    setChatInput("");
    restorePendingFromThread(newThread.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, locale, handleStopChat, flushPendingEditsToThread, restorePendingFromThread]);

  const handleSwitchChat = useCallback((id: string) => {
    if (id === activeChatIdRef.current) return;
    handleStopChat();
    flushPendingEditsToThread();
    const snapshotted = snapshotActiveThread(
      chatThreadsRef.current,
      activeChatIdRef.current,
      messages,
    );
    const target = snapshotted.find((th) => th.id === id);
    if (!target) return;
    const merged = [
      target,
      ...getPersistedThreads(snapshotted).filter((th) => th.id !== target.id),
    ];
    setChatThreads(merged);
    setActiveChatId(id);
    setMessages(restoreMessages(target));
    restorePendingFromThread(id);
    if (projectId && getPersistedThreads(merged).length > 0) {
      persistChatThreads(projectId, merged, onChatPersistError);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, projectId, handleStopChat, flushPendingEditsToThread, restorePendingFromThread, onChatPersistError]);

  const handleRenameChat = useCallback((id: string, title: string) => {
    const updated = chatThreadsRef.current.map((th) =>
      th.id === id ? { ...th, title, updatedAt: Date.now() } : th,
    );
    setChatThreads(updated);
    if (projectId) {
      const renamed = updated.find((th) => th.id === id);
      if (renamed && isPersistedThread(renamed)) {
        persistChatThreads(projectId, updated, onChatPersistError);
      }
    }
  }, [projectId, onChatPersistError]);

  const handleDeleteChat = useCallback((id: string) => {
    handleStopChat();
    const tCopy = editorCopy(locale);
    const filtered = chatThreadsRef.current.filter((th) => th.id !== id);
    const persisted = getPersistedThreads(filtered);
    if (persisted.length === 0) {
      const newThread = makeThread(tCopy.sidebar.defaultChatTitle);
      setChatThreads([newThread]);
      setActiveChatId(newThread.id);
      setMessages(makeInitialMessages(locale));
      restorePendingFromThread(newThread.id);
      if (projectId) persistChatThreads(projectId, [], onChatPersistError);
      return;
    }
    setChatThreads(persisted);
    if (id === activeChatIdRef.current) {
      const next = persisted[0];
      setActiveChatId(next.id);
      setMessages(restoreMessages(next));
      restorePendingFromThread(next.id);
    }
    if (projectId) persistChatThreads(projectId, persisted, onChatPersistError);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, locale, handleStopChat, restorePendingFromThread, onChatPersistError]);

  // Debounced backup save while typing / streaming
  useEffect(() => {
    if (!projectId || !activeChatId) return;
    if (!threadHasUserMessages(messages)) return;
    const timer = setTimeout(() => {
      persistActiveThreadNow(messagesRef.current);
    }, 2000);
    return () => clearTimeout(timer);
  }, [messages, projectId, activeChatId, persistActiveThreadNow]);

  useEffect(() => {
    if (!projectId) return;
    const flushOnLeave = () => {
      flushPendingEditsToThread();
      persistActiveThreadNow(messagesRef.current);
    };
    window.addEventListener("beforeunload", flushOnLeave);
    window.addEventListener("pagehide", flushOnLeave);
    return () => {
      window.removeEventListener("beforeunload", flushOnLeave);
      window.removeEventListener("pagehide", flushOnLeave);
    };
  }, [projectId, persistActiveThreadNow, flushPendingEditsToThread]);



  useEffect(() => {
    if (!threadHasUserMessages(messages)) {
      setMessages(makeInitialMessages(locale));
    }
  // Only sync welcome copy when locale changes on a fresh thread
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    latexSyncRef.current = resetChatLatexSync();
  }, [projectId]);

  useEffect(() => {
    if (chatLoading) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading]);

  const openChatPanel = useCallback(() => {
    setChatOpen(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileChatOpen(true);
    }
  }, [setMobileChatOpen]);

  const queueChatFollowUp = useCallback(
    (prefill: string) => {
      setChatComposerMode("normal");
      setChatInput(prefill);
      openChatPanel();
    },
    [openChatPanel],
  );

  const handleClearChatSelectionContext = useCallback(() => {
    setChatSelectionContext(null);
    setChatComposerMode("normal");
    setSelection("");
  }, [setSelection]);

  const syncChatStreamProgress = useCallback(() => {
    setChatStreamProgress({ ...getChatStreamProgressSnapshot() });
  }, []);

  const handleSend = useCallback(async () => {
    const ctx = sendCtxRef.current;
    const logicLaunch = logicAuditLaunchRef.current;
    if (logicLaunch) logicAuditLaunchRef.current = null;
    const editLaunch = agentEditLaunchRef.current;
    if (editLaunch) agentEditLaunchRef.current = null;

    const raw = logicLaunch?.message ?? editLaunch?.message ?? ctx.chatInput.trim();
    if (!raw || ctx.chatLoading || !projectId) return;

    const parsedPreview = logicLaunch
      ? { task: "logic" as const, message: logicLaunch.message, command: "logic" as const }
      : editLaunch
        ? { task: "edit" as const, message: editLaunch.message, command: "edit" as const }
        : parseChatSlashCommand(raw, locale);
    const isLogicAuditTask = Boolean(logicLaunch) || parsedPreview.task === "logic";

    const tCopy = editorCopy(locale);
    if (!activeChatIdRef.current) {
      const initial = makeThread(tCopy.sidebar.defaultChatTitle);
      flushSync(() => {
        setChatThreads([initial]);
        setActiveChatId(initial.id);
      });
    }

    const parsed = parsedPreview;
    const text = parsed.message;
    const activeSelection = ctx.chatSelectionContext?.text ?? ctx.selection;
    const sentSelection = ctx.chatSelectionContext;
    const casualChat = isCasualChatMessage(text);
    const task =
      ctx.chatComposerMode === "quick-edit" && !casualChat
        ? ("edit" as const)
        : parsed.task ?? undefined;
    const userDisplay =
      logicLaunch?.userDisplay ??
      editLaunch?.userDisplay ??
      (parsed.command ? `/${parsed.command} · ${text}` : raw);
    const logicAuditMode =
      logicLaunch?.mode ?? parsed.logicAuditMode ?? (task === "logic" ? "quick" : undefined);
    const logicAuditScope =
      logicLaunch?.scope ?? parsed.logicAuditScope ?? (task === "logic" ? "selected" : undefined);
    const logicAuditSections = logicLaunch?.sections;
    const sectionOptions = listLogicAuditSectionOptions(
      parseLatexOutline(ctx.mainLatexSource),
    );
    const targetSectionCount = logicLaunch
      ? logicLaunch.targetSectionCount
      : logicAuditTargetSectionCount(
          logicAuditMode ?? "quick",
          logicAuditScope ?? "selected",
          logicAuditSections?.length ?? 0,
          sectionOptions.length,
          sectionOptions,
        );
    openChatPanel();
    chatAbortRef.current?.abort();
    const abort = new AbortController();
    chatAbortRef.current = abort;

    const sentMainFile = ctx.mainFile;
    const sentActiveFile = ctx.activeFile;
    const sentMainLatex = ctx.mainLatexSource;
    const sentActiveLatex = ctx.latex;
    const fileSnapshotsAtSend = new Map<string, string>();
    fileSnapshotsAtSend.set(sentMainFile, sentMainLatex);
    fileSnapshotsAtSend.set(sentActiveFile, sentActiveLatex);
    for (const f of ctx.projectFiles) {
      fileSnapshotsAtSend.set(f.path, f.content);
    }

    const conversationHistory = buildConversationHistory(messagesRef.current);

    // Auto-title + persist thread on first user message
    const activeThread = chatThreadsRef.current.find((th) => th.id === activeChatIdRef.current);
    const hasUserMessages = threadHasUserMessages(messagesRef.current);
    if (activeThread && !hasUserMessages) {
      const autoTitle =
        activeThread.title === tCopy.sidebar.defaultChatTitle
          ? text.slice(0, 40) + (text.length > 40 ? "…" : "")
          : activeThread.title;
      const userMsg: StoredChatMessage = { role: "user", content: userDisplay };
      const updated = chatThreadsRef.current.map((th) =>
        th.id === activeChatIdRef.current
          ? { ...th, title: autoTitle, messages: [userMsg], updatedAt: Date.now() }
          : th,
      );
      chatThreadsRef.current = updated;
      setChatThreads(updated);
      if (projectId) persistChatThreads(projectId, updated, onChatPersistError);
    }

    flushSync(() => {
      resetChatStreamProgress();
      syncChatStreamProgress();
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userDisplay },
        {
          role: "assistant",
          content: "",
          reasoning: "",
          activities: [],
          aiSteps: [],
          streamLabel: t.chatStream.processing,
          streamElapsedSec: null,
          isStreaming: true,
        },
      ]);
    });
    setChatInput("");
    setChatComposerMode("normal");
    if (task === "logic") {
      sideEffects.setToolsOpen(true);
      logicAuditPartialCountRef.current = 0;
      setAuditSectionProgress({ completed: 0, total: targetSectionCount });
      setAuditInProgress(true);
    }
    setChatLoading(true);
    const replacesPendingEdits =
      task === "edit" || task === "style" || task === "template";
    if (replacesPendingEdits) {
      setPendingSuggestion(null);
      setPendingEdits(null);
      setActiveEditId(null);
    }

    const patchAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        let idx = next.findLastIndex((m) => m.role === "assistant" && m.isStreaming);
        if (idx === -1) {
          idx = next.findLastIndex((m) => m.role === "assistant");
        }
        if (idx === -1) return prev;
        next[idx] = updater(next[idx] as ChatMessage);
        return next;
      });
    };

    chatSmoothStreamRef.current?.dispose();
    chatSmoothStreamRef.current = createSmoothStream((displayed) => {
      flushSync(() => {
        patchAssistant((msg) => ({ ...msg, content: displayed, isError: false }));
      });
    });

    const CHAT_STREAM_TIMEOUT_MS =
      task === "logic"
        ? logicAuditClientTimeoutMs(logicAuditMode ?? "quick", logicAuditScope ?? "selected")
        : agentChatStreamTimeoutMs(task, ctx.llmModel || undefined);
    let chatTimedOut = false;
    const chatTimeoutId = setTimeout(() => {
      if (!abort.signal.aborted) {
        chatTimedOut = true;
        abort.abort();
      }
    }, CHAT_STREAM_TIMEOUT_MS);

    const mainHash = contentFingerprint(sentMainLatex);
    const activeHash = contentFingerprint(sentActiveLatex);

    const streamCallbacks = (resyncRef: { required: boolean }) => ({
      onActivity: (activityText: string) => {
        if (isProgressNoiseActivity(activityText)) return;
        pushChatStreamActivity(activityText);
      },
      onState: (state: ChatAiStatePayload) => {
        pushChatStreamState(state);
        if (
          task === "logic" &&
          state.step_id === "logic-cross" &&
          state.status === "done"
        ) {
          setAuditSectionProgress((prev) =>
            prev
              ? { ...prev, completed: Math.min(prev.total, prev.completed + 1) }
              : prev,
          );
        }
        if (isProgressNoiseStep(state.step_id)) return;

        const important = isImportantFeedEvent(state);
        const applyUpdate = () => {
          patchAssistant((msg) => {
            const aiSteps = applyAiState(msg.aiSteps ?? [], state);
            const active = filterDisplaySteps(aiSteps).find((s) => s.status === "active");
            const activities = important
              ? appendImportantFeedLine(msg.activities ?? [], state)
              : (msg.activities ?? []);
            return {
              ...msg,
              activities,
              aiSteps,
              streamLabel:
                state.status === "active" && state.detail
                  ? `${state.label} — ${state.detail}`
                  : active?.label ?? state.label,
              streamElapsedSec:
                typeof state.elapsed_sec === "number"
                  ? state.elapsed_sec
                  : msg.streamElapsedSec,
            };
          });
          syncChatStreamProgress();
        };

        if (important) {
          flushSync(applyUpdate);
        } else {
          applyUpdate();
        }
      },
      onToken: (delta: string) => {
        const progress = getChatStreamProgressSnapshot();
        const isLogicAudit = progress.steps.some((s) => s.id.startsWith("logic-"));
        if (isLogicAudit) return;
        chatSmoothStreamRef.current?.push(delta);
      },
      onReasoning: (delta: string) => {
        if (task === "logic") return;
        patchAssistant((msg) => ({
          ...msg,
          reasoning: `${msg.reasoning ?? ""}${delta}`,
        }));
      },
      onLogicSection: (section: NonNullable<LogicAuditReport["sections"]>[number]) => {
        logicAuditPartialCountRef.current += 1;
        setAuditSectionProgress((prev) =>
          prev
            ? { ...prev, completed: logicAuditPartialCountRef.current }
            : { completed: logicAuditPartialCountRef.current, total: targetSectionCount },
        );
        flushSync(() => {
          sideEffects.setLogicAuditReport((prev) => mergeLogicSectionReport(prev, section));
          sideEffects.setToolsOpen(true);
        });
      },
      onDone: (result: ChatResult) => {
        chatSmoothStreamRef.current?.flush();
        const progress = getChatStreamProgressSnapshot();
        const finalSteps = filterDisplaySteps(
          progress.steps.length ? progress.steps : [],
        );
        const hasLogicReport = Boolean(result.logic_audit_report?.sections?.length);
        patchAssistant((msg) => ({
          ...msg,
          content: result.response || (hasLogicReport ? "" : msg.content),
          isStreaming: false,
          isError: false,
          aiSteps: filterDisplaySteps(msg.aiSteps ?? []).length
            ? filterDisplaySteps(msg.aiSteps ?? [])
            : finalSteps,
          activities: msg.activities?.length ? msg.activities : progress.activities,
        }));
        const edits = (result.edits ?? []).filter(
          (e) => e?.replacement_text && e?.original_text,
        );
        const selectionAnchor =
          sentSelection &&
          sentSelection.end > sentSelection.start
            ? sentSelection
            : null;
        const contentForEditFile = (filePath: string) =>
          fileSnapshotsAtSend.get(filePath) ??
          (filePath === sentActiveFile
            ? sentActiveLatex
            : filePath === sentMainFile
              ? sentMainLatex
              : "");
        if (edits.length > 0) {
          const mapped: PendingEdit[] = edits.map((e) => {
            const editFile = e.file || sentMainFile;
            const fileContent = contentForEditFile(editFile);
            const hasBackendAnchor =
              e.selection_start != null &&
              e.selection_end != null &&
              e.selection_end > e.selection_start;
            const anchor =
              hasBackendAnchor
                ? { start: e.selection_start!, end: e.selection_end! }
                : editFile === sentActiveFile
                  ? selectionAnchor
                  : null;
            return {
              id: e.id,
              file: editFile,
              section: e.section,
              applyMode: (e.apply_mode ?? result.apply_mode ?? "selection") as
                | "selection"
                | "document",
              originalText: anchor
                ? fileContent.slice(anchor.start, anchor.end)
                : e.original_text,
              replacementText: anchor
                ? clampSelectionReplacement(
                    fileContent.slice(anchor.start, anchor.end),
                    e.replacement_text,
                  )
                : e.replacement_text,
              description: e.description,
              flags: result.integrity_flags ?? [],
              revisionId: result.revision_id || undefined,
              accepted: false,
              selectionStart: anchor?.start,
              selectionEnd: anchor?.end,
              sourceFingerprint: contentFingerprint(
                fileSnapshotsAtSend.get(editFile) ?? fileContent,
              ),
            };
          });
          setPendingEdits(mapped);
          setActiveEditId(mapped[0]?.id ?? null);
        } else if (result.suggestion && result.original_text) {
          const suggestionFile = sentActiveFile;
          const fileContent = contentForEditFile(suggestionFile);
          setPendingSuggestion({
            file: suggestionFile,
            originalText: selectionAnchor?.text ?? result.original_text,
            suggestion: selectionAnchor
              ? clampSelectionReplacement(selectionAnchor.text, result.suggestion)
              : result.suggestion,
            diff: result.diff ?? "",
            flags: result.integrity_flags ?? [],
            applyMode: selectionAnchor
              ? "selection"
              : (result.apply_mode ?? "selection"),
            revisionId: result.revision_id || undefined,
            selectionStart: selectionAnchor?.start,
            selectionEnd: selectionAnchor?.end,
            sourceFingerprint: contentFingerprint(
              fileSnapshotsAtSend.get(suggestionFile) ?? fileContent,
            ),
          });
        }
        if (result.citation_results?.length) {
          sideEffects.setCitationResults(result.citation_results);
          sideEffects.setCitationSummary(result.response || result.analysis || "");
          const unverified = result.citation_results.filter(
            (r) => r?.status !== "verified",
          ).length;
          if (unverified > 0) {
            sideEffects.setToolsTab("citations");
            sideEffects.setToolsOpen(true);
          }
        }
        if (result.structure_suggestions?.length) {
          sideEffects.setStructureSuggestions(result.structure_suggestions as StructureSuggestion[]);
          const actionable = result.structure_suggestions.filter(
            (s) => s?.severity === "warning" || s?.severity === "error",
          );
          if (actionable.length > 0) {
            sideEffects.setToolsTab("structure");
            sideEffects.setToolsOpen(true);
          }
        }
        if (result.logic_audit_report?.sections?.length) {
          const isGate =
            (result.logic_audit_report as { meta?: Record<string, unknown> }).meta
              ?.audit_mode === "gate";
          if (!isGate) {
            sideEffects.setLogicAuditReport(result.logic_audit_report);
            sideEffects.lastPanelAuditFingerprintRef.current =
              logicAuditFingerprint(sentMainLatex);
            sideEffects.setToolsOpen(true);
          }
        }
        if (result.revision_id) {
          void refreshRevisions();
        }
      },
      onError: (message: string, meta?: { code?: string; reason?: string }) => {
        if (
          meta?.code === CHAT_CONTENT_RESYNC_CODE &&
          !abort.signal.aborted
        ) {
          resyncRef.required = true;
          return;
        }
        chatSmoothStreamRef.current?.dispose();
        chatSmoothStreamRef.current = null;
        patchAssistant((msg) => ({
          ...msg,
          content: message,
          isStreaming: false,
          isError: true,
        }));
      },
    });

    try {
      await syncSession(projectId, projectName, sentMainLatex).catch(() => {});

      let streamCompleted = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const forceFullPayload = attempt > 0;
        const resyncRef = { required: false };
        const syncState = forceFullPayload ? resetChatLatexSync() : latexSyncRef.current;
        const latexPayload = buildChatLatexPayload(
          sentMainLatex,
          sentActiveLatex,
          sentActiveFile,
          sentMainFile,
          syncState,
          forceFullPayload,
        );

        await streamChat(
          text,
          {
            sessionId: projectId,
            latexContent: latexPayload.latexContent,
            latexContentHash: latexPayload.latexContentHash,
            activeFileContent: latexPayload.activeFileContent,
            activeFileContentHash: latexPayload.activeFileContentHash,
            activeFile: sentActiveFile,
            mainFile: sentMainFile,
            selection: activeSelection,
            selectionStart: sentSelection?.start,
            selectionEnd: sentSelection?.end,
            locale,
            task,
            llm_provider: ctx.llmProvider || undefined,
            llm_model: ctx.llmModel || undefined,
            integrity_strictness: ctx.integrityStrictness,
            ...(task === "logic" && logicAuditMode
              ? { logic_audit_mode: logicAuditMode }
              : {}),
            ...(task === "logic" && logicAuditScope
              ? { logic_audit_scope: logicAuditScope }
              : {}),
            ...(task === "logic" &&
            logicAuditScope !== "full" &&
            logicAuditSections?.length
              ? { logic_audit_sections: logicAuditSections }
              : {}),
            conversationHistory,
          },
          streamCallbacks(resyncRef),
          abort.signal,
        );

        if (resyncRef.required && attempt === 0 && !abort.signal.aborted) {
          latexSyncRef.current = resetChatLatexSync();
          continue;
        }

        if (!resyncRef.required) {
          latexSyncRef.current = nextChatLatexSync(
            latexSyncRef.current,
            mainHash,
            activeHash,
            sentActiveFile,
            latexPayload,
          );
        }
        streamCompleted = true;
        break;
      }
      if (!streamCompleted && !abort.signal.aborted) {
        patchAssistant((msg) => ({
          ...msg,
          content: t.chatStream.resyncFailed,
          isStreaming: false,
          isError: true,
        }));
      }
    } finally {
      clearTimeout(chatTimeoutId);
      chatSmoothStreamRef.current?.dispose();
      chatSmoothStreamRef.current = null;
      finishChatStreamProgress();
      syncChatStreamProgress();
      setChatLoading(false);
      setAuditInProgress(false);
      setAuditSectionProgress(null);
      chatAbortRef.current = null;
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        const next = [...prev];
        const msg = next[idx] as ChatMessage;
        if (abort.signal.aborted) {
          const partialSections = logicAuditPartialCountRef.current;
          const partialContent =
            task === "logic" && partialSections > 0
              ? chatTimedOut
                ? t.logicAudit.partialChatTimeout(partialSections)
                : t.logicAudit.partialChatStopped(partialSections)
              : chatTimedOut
                ? t.chatStream.timeout
                : t.chatStream.stopped;
          next[idx] = {
            ...msg,
            isStreaming: false,
            content: msg.content.trim() || partialContent,
          };
          persistActiveThreadNow(next);
          return next;
        }
        if (msg.isError && msg.content.trim()) {
          next[idx] = { ...msg, isStreaming: false };
          persistActiveThreadNow(next);
          return next;
        }
        next[idx] = {
          ...msg,
          isStreaming: false,
          content:
            msg.content.trim() ||
            llmUserErrorMsg(locale),
        };
        persistActiveThreadNow(next);
        return next;
      });
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [
    locale,
    projectId,
    projectName,
    t.chatStream.timeout,
    t.chatStream.stopped,
    t.chatStream.resyncFailed,
    t.logicAudit.partialChatStopped,
    t.logicAudit.partialChatTimeout,
    openChatPanel,
    persistActiveThreadNow,
    onChatPersistError,
    refreshRevisions,
    syncChatStreamProgress,
    sideEffects,
  ]);

  const resolveFileContent = useCallback(
    (filePath: string): string => {
      if (filePath === activeFile) return latex;
      if (filePath === mainFile) return mainLatexSource;
      return projectFiles.find((f) => f.path === filePath)?.content ?? "";
    },
    [activeFile, mainFile, latex, mainLatexSource, projectFiles],
  );

  const applyEditToProject = useCallback(
    (edit: PendingEdit): string | null => {
      const { nextActiveLatex, nextProjectFiles } = applyEditToProjectFiles({
        edit,
        activeFile,
        mainFile,
        latex,
        mainLatexSource,
        projectFiles,
      });
      if (nextProjectFiles) setProjectFiles(nextProjectFiles);
      if (nextActiveLatex) recordNow(nextActiveLatex);
      return nextActiveLatex;
    },
    [activeFile, mainFile, latex, mainLatexSource, projectFiles, recordNow],
  );

  const runLogicAuditFromPanel = (
    mode: LogicAuditMode,
    scope: LogicAuditScope,
    sections: string[],
  ) => {
    if (chatLoading || auditInProgress || scoreAuditLoading || !projectId) return;
    if (scope !== "full" && sections.length === 0) return;
    const full = scope === "full";
    const auditCopy = t.logicAudit.panelLaunch;
    const sectionOptions = listLogicAuditSectionOptions(parseLatexOutline(mainLatexSource));
    const targetSectionCount = logicAuditTargetSectionCount(
      mode,
      scope,
      sections.length,
      sectionOptions.length,
      sectionOptions,
    );
    logicAuditLaunchRef.current = {
      mode,
      scope,
      sections,
      targetSectionCount,
      userDisplay: full
        ? mode === "deep"
          ? auditCopy.displayDeepFull
          : auditCopy.displayQuickFull
        : mode === "deep"
          ? auditCopy.displayDeep
          : auditCopy.displayQuick,
      message: full
        ? auditCopy.messageFull
        : mode === "deep"
          ? auditCopy.messageDeepSelected
          : auditCopy.messageQuickSelected,
    };
    openChatPanel();
    void handleSend();
  };

  const runAgentEdit = useCallback(
    (message: string, userDisplay?: string) => {
      if (chatLoading || auditInProgress || !projectId) return;
      const section = message.trim();
      if (!section) return;
      agentEditLaunchRef.current = {
        message: section,
        userDisplay: userDisplay ?? `/${locale === "vi" ? "edit" : "edit"} · ${section}`,
      };
      openChatPanel();
      void handleSend();
    },
    [chatLoading, auditInProgress, projectId, locale, openChatPanel, handleSend],
  );

  const composerHint = useMemo(() => {
    if (chatLoading || chatInput.trim()) return null;
    if (pendingEdits?.length) return t.chatDock.hintPendingEdits;
    if (chatSelectionContext?.text?.trim() || selection.trim()) return null;
    if (chatComposerMode === "quick-edit") return null;
    return t.chatDock.hintEditScope;
  }, [
    chatLoading,
    chatInput,
    pendingEdits,
    chatSelectionContext,
    selection,
    chatComposerMode,
    t.chatDock.hintPendingEdits,
    t.chatDock.hintEditScope,
  ]);

  const handleAcceptSuggestion = useCallback(() => {
    if (!pendingSuggestion) return;
    const fileContent = resolveFileContent(pendingSuggestion.file || mainFile);
    if (
      pendingSuggestion.sourceFingerprint &&
      contentFingerprint(fileContent) !== pendingSuggestion.sourceFingerprint
    ) {
      toast.error(t.pendingEdits.staleOnAccept);
      return;
    }
    const pseudoEdit = suggestionToPendingEdit(pendingSuggestion, mainFile);
    const { nextActiveLatex, nextProjectFiles } = applyEditToProjectFiles({
      edit: pseudoEdit,
      activeFile,
      mainFile,
      latex,
      mainLatexSource,
      projectFiles,
    });
    if (!nextActiveLatex && !nextProjectFiles) return;
    if (nextActiveLatex) recordNow(nextActiveLatex);
    if (nextProjectFiles) setProjectFiles(nextProjectFiles);
    const revisionId = pendingSuggestion.revisionId;
    setPendingSuggestion(null);
    reportRevisionAction(revisionId, "accepted");
    onAfterEditAccepted?.();
    if (autoCompile && nextActiveLatex) {
      runCompileAfterEdit(nextActiveLatex);
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: autoCompile
          ? t.chatStream.acceptAppliedCompile
          : t.chatStream.acceptApplied,
      },
    ]);
  }, [
    pendingSuggestion,
    resolveFileContent,
    mainFile,
    activeFile,
    latex,
    mainLatexSource,
    projectFiles,
    recordNow,
    reportRevisionAction,
    autoCompile,
    runCompileAfterEdit,
    t.pendingEdits.staleOnAccept,
    t.chatStream.acceptAppliedCompile,
    t.chatStream.acceptApplied,
    onAfterEditAccepted,
  ]);

  const handleRejectSuggestion = useCallback(() => {
    const revisionId = pendingSuggestion?.revisionId;
    const section =
      pendingSuggestion?.applyMode === "document"
        ? t.chatStream.rejectScopeDocument
        : undefined;
    setPendingSuggestion(null);
    reportRevisionAction(revisionId, "rejected");
    queueChatFollowUp(
      buildEditRedoPrompt({
        section,
        scope: t.chatStream.rejectScopeStyle,
      }),
    );
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: t.chatStream.rejectSuggestionHint,
      },
    ]);
  }, [
    pendingSuggestion,
    reportRevisionAction,
    queueChatFollowUp,
    t.chatStream.rejectScopeDocument,
    t.chatStream.rejectScopeStyle,
    t.chatStream.rejectSuggestionHint,
  ]);

  const handleAcceptEdit = useCallback(
    (editId: string) => {
      if (!pendingEdits) return;
      const edit = pendingEdits.find((e) => e.id === editId);
      if (!edit || hasBlockingIntegrityFlags(edit.flags)) return;
      const fileContent = resolveFileContent(edit.file || mainFile);
      if (!canApplyPendingEdit(edit, fileContent)) {
        toast.error(t.pendingEdits.staleOnAccept);
        return;
      }
      const nextLatex = applyEditToProject(edit);
      const remaining = pendingEdits.filter((e) => e.id !== editId);
      setPendingEdits(remaining.length ? remaining : null);
      setActiveEditId(remaining[0]?.id ?? null);
      reportRevisionAction(edit.revisionId, "accepted");
      onAfterEditAccepted?.();
      if (nextLatex) {
        runCompileAfterEdit(nextLatex);
      }
    },
    [
      pendingEdits,
      applyEditToProject,
      reportRevisionAction,
      runCompileAfterEdit,
      resolveFileContent,
      mainFile,
      t.pendingEdits.staleOnAccept,
      onAfterEditAccepted,
    ],
  );

  const handleRejectEdit = useCallback(
    (editId: string) => {
      if (!pendingEdits) return;
      const edit = pendingEdits.find((e) => e.id === editId);
      const remaining = pendingEdits.filter((e) => e.id !== editId);
      setPendingEdits(remaining.length ? remaining : null);
      setActiveEditId(remaining[0]?.id ?? null);
      reportRevisionAction(edit?.revisionId, "rejected");
      if (edit) {
        queueChatFollowUp(
          buildEditRedoPrompt({
            section: edit.section,
            description: edit.description,
          }),
        );
      }
    },
    [pendingEdits, reportRevisionAction, queueChatFollowUp],
  );

  const handleAcceptAllEdits = useCallback(() => {
    if (!pendingEdits?.length) return;
    if (pendingEdits.some((e) => hasBlockingIntegrityFlags(e.flags))) return;
    const applicable = pendingEdits.filter((edit) =>
      canApplyPendingEdit(edit, resolveFileContent(edit.file || mainFile)),
    );
    if (!applicable.length) {
      toast.error(t.pendingEdits.staleOnAccept);
      return;
    }
    if (applicable.length < pendingEdits.length) {
      toast.warning(t.pendingEdits.staleWarning);
    }
    let nextLatex = latex;
    let files = projectFiles;
    for (const edit of applicable) {
      const targetPath = edit.file || mainFile;
      if (targetPath === activeFile) {
        nextLatex = applySingleEdit(nextLatex, edit);
        files = persistActiveFile(nextLatex, files, activeFile);
      } else {
        files = files.map((f) =>
          f.path === targetPath
            ? { ...f, content: applySingleEdit(f.content, edit) }
            : f,
        );
      }
      reportRevisionAction(edit.revisionId, "accepted");
    }
    if (nextLatex !== latex) {
      recordNow(nextLatex);
    }
    setProjectFiles(files);
    setPendingEdits(null);
    setActiveEditId(null);
    onAfterEditAccepted?.();
    if (nextLatex !== latex) {
      runCompileAfterEdit(nextLatex);
    }
  }, [
    pendingEdits,
    latex,
    projectFiles,
    mainFile,
    activeFile,
    applySingleEdit,
    recordNow,
    persistActiveFile,
    runCompileAfterEdit,
    resolveFileContent,
    reportRevisionAction,
    onAfterEditAccepted,
    t.pendingEdits.staleOnAccept,
    t.pendingEdits.staleWarning,
  ]);

  const handleRejectAllEdits = useCallback(() => {
    if (pendingEdits?.length) {
      for (const edit of pendingEdits) {
        reportRevisionAction(edit.revisionId, "rejected");
      }
    }
    setPendingEdits(null);
    setActiveEditId(null);
    queueChatFollowUp(
      buildEditRedoPrompt({
        scope: t.chatStream.rejectScopeAllEdits,
      }),
    );
  }, [pendingEdits, queueChatFollowUp, reportRevisionAction, t.chatStream.rejectScopeAllEdits]);

  const hydrateChatFromProject = useCallback(
    (rawThreads: ChatThread[] | undefined): ChatThread[] => {
      skipNextEditPersistRef.current = true;
      const persisted = (rawThreads ?? []).filter(isPersistedThread);
      if (persisted.length) {
        setChatThreads(persisted);
        const first = persisted[0];
        setActiveChatId(first.id);
        setMessages(restoreMessages(first));
        restorePendingFromThread(first.id);
        return persisted;
      }
      const initial = makeThread(editorCopy(locale).sidebar.defaultChatTitle);
      setChatThreads([initial]);
      setActiveChatId(initial.id);
      setMessages(makeInitialMessages(locale));
      return [];
    },
    [locale, restorePendingFromThread],
  );

  useEffect(() => {
    if (!projectId || !activeChatId) return;
    // Hydration sets activeChatId, which fires this effect with no real
    // inline-edit change to persist. Skip that run to avoid a redundant
    // PATCH /papers on open (which otherwise races the session sync write).
    if (skipNextEditPersistRef.current) {
      skipNextEditPersistRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const updated = flushPendingEditsToThread();
      if (getPersistedThreads(updated).length > 0) {
        persistChatThreads(projectId, updated, onChatPersistError);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [
    pendingEdits,
    activeEditId,
    activeChatId,
    projectId,
    flushPendingEditsToThread,
    onChatPersistError,
  ]);

  useEffect(() => {
    if (!pendingSuggestion) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleRejectSuggestion();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleAcceptSuggestion();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingSuggestion, handleAcceptSuggestion, handleRejectSuggestion]);

  const handleProviderChange = useCallback(
    (p: LLMProvider) => {
      setLlmProvider(p);
      const info = providers.find((x) => x.id === p);
      if (info) setLlmModel(pickFirstFreeModel(info));
    },
    [providers, setLlmProvider, setLlmModel],
  );

  const chatProps = useMemo(
    () => ({
      messages,
      chatInput,
      onChatInputChange: setChatInput,
      onSend: handleSend,
      onStop: handleStopChat,
      chatEndRef,
      chatLoading,
      streamProgress: chatStreamProgress,
      providers,
      llmProvider,
      llmModel,
      onProviderChange: handleProviderChange,
      onModelChange: setLlmModel,
      onNewChat: handleNewChat,
      onOpenChat: () => setChatOpen(true),
      onCloseChat: () => setChatOpen(false),
      chatComposerMode,
      chatSelectionContext,
      onClearChatSelectionContext: handleClearChatSelectionContext,
      onUndo: undo,
      onRedo: redo,
      canUndo,
      canRedo,
      pendingSuggestion,
      onAcceptSuggestion: handleAcceptSuggestion,
      onRejectSuggestion: handleRejectSuggestion,
      composerHint,
    }),
    [
      messages,
      chatInput,
      handleSend,
      handleStopChat,
      chatLoading,
      chatStreamProgress,
      providers,
      llmProvider,
      llmModel,
      handleProviderChange,
      setLlmModel,
      handleNewChat,
      chatComposerMode,
      chatSelectionContext,
      handleClearChatSelectionContext,
      undo,
      redo,
      canUndo,
      canRedo,
      pendingSuggestion,
      handleAcceptSuggestion,
      handleRejectSuggestion,
      composerHint,
    ],
  );


  return {
    messages,
    setMessages,
    chatThreads,
    activeChatId,
    chatInput,
    setChatInput,
    chatOpen,
    setChatOpen,
    chatLoading,
    auditInProgress,
    auditSectionProgress,
    chatStreamProgress,
    chatEndRef,
    chatSelectionContext,
    setChatSelectionContext,
    chatComposerMode,
    setChatComposerMode,
    pendingEdits,
    pendingSuggestion,
    activeEditId,
    setActiveEditId,
    resolveFileContent,
    handleNewChat,
    handleSwitchChat,
    handleRenameChat,
    handleDeleteChat,
    handleSend,
    handleStopChat,
    openChatPanel,
    queueChatFollowUp,
    handleClearChatSelectionContext,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    handleAcceptEdit,
    handleRejectEdit,
    handleAcceptAllEdits,
    handleRejectAllEdits,
    runLogicAuditFromPanel,
    runAgentEdit,
    hydrateChatFromProject,
    persistActiveThreadNow,
    chatProps,
  };
}
