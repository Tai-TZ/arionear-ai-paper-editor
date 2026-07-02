import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ChatMessage } from "@/components/chat-overlay";
import { editorCopy } from "@/lib/editor-i18n";
import {
  appendImportantFeedLine,
  applyAiState,
  filterDisplaySteps,
  isImportantFeedEvent,
  isProgressNoiseActivity,
  isProgressNoiseStep,
  revisionAction,
  streamChat,
  type ChatAiStatePayload,
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
import { isSelectedModelPaid } from "@/lib/llm-model-tier";
import { canApplyPendingEdit, contentFingerprint } from "@/lib/pending-edit-utils";
import { hasBlockingIntegrityFlags } from "@/lib/integrity-flags";
import { mergeLogicSectionReport } from "@/lib/logic-audit";
import { buildEditRedoPrompt, type StructureSuggestion } from "@/lib/structure-suggestions";
import { logicAuditFingerprint } from "@/lib/paper-score-audit";
import type { ChatThread, ProjectFile, StoredChatMessage } from "@/lib/project-store";
import type { UiLanguage, ResearcherProfile } from "@/lib/researcher-profile";
import type { LogicAuditMode, LogicAuditScope } from "@/lib/logic-audit";
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
  lastAuditFingerprintRef: React.MutableRefObject<string | null>;
};

export type UseEditorChatOptions = {
  projectId: string | undefined;
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
  handleCompile: (latexOverride?: string) => Promise<void>;
  setMobileChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sideEffects: EditorChatSideEffects;
};

export function useEditorChat(options: UseEditorChatOptions) {
  const {
    projectId,
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
    handleCompile,
    setMobileChatOpen,
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

  const chatEndRef = useRef<HTMLDivElement>(null);
  const latexSyncRef = useRef<ChatLatexSyncState>(resetChatLatexSync());
  const logicAuditLaunchRef = useRef<{
    mode: LogicAuditMode;
    scope: LogicAuditScope;
    sections: string[];
    userDisplay: string;
    message: string;
  } | null>(null);

  type ThreadPendingSnapshot = {
    pendingEdits: PendingEdit[] | null;
    pendingSuggestion: PendingSuggestion | null;
    activeEditId: string | null;
  };

  const EMPTY_THREAD_PENDING: ThreadPendingSnapshot = {
    pendingEdits: null,
    pendingSuggestion: null,
    activeEditId: null,
  };

  const threadPendingRef = useRef<Map<string, ThreadPendingSnapshot>>(new Map());

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
    integrityStrictness: "strict" as ResearcherProfile["integrityStrictness"],
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

  const snapshotThreadPending = useCallback(
    (threadId: string) => {
      if (!threadId) return;
      threadPendingRef.current.set(threadId, {
        pendingEdits,
        pendingSuggestion,
        activeEditId,
      });
    },
    [pendingEdits, pendingSuggestion, activeEditId],
  );

  const restoreThreadPending = useCallback((threadId: string) => {
    const snap = threadPendingRef.current.get(threadId) ?? EMPTY_THREAD_PENDING;
    setPendingEdits(snap.pendingEdits);
    setPendingSuggestion(snap.pendingSuggestion);
    setActiveEditId(snap.activeEditId);
  }, []);

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
    snapshotThreadPending(activeChatIdRef.current);
    if (!threadHasUserMessages(messages)) {
      setMessages(makeInitialMessages(locale));
      setChatInput("");
      restoreThreadPending(activeChatIdRef.current);
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
    restoreThreadPending(newThread.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, locale, handleStopChat, snapshotThreadPending, restoreThreadPending]);

  const handleSwitchChat = useCallback((id: string) => {
    if (id === activeChatIdRef.current) return;
    handleStopChat();
    snapshotThreadPending(activeChatIdRef.current);
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
    restoreThreadPending(id);
    if (projectId && getPersistedThreads(merged).length > 0) {
      persistChatThreads(projectId, merged, onChatPersistError);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, projectId, handleStopChat, snapshotThreadPending, restoreThreadPending, onChatPersistError]);

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
    threadPendingRef.current.delete(id);
    const tCopy = editorCopy(locale);
    const filtered = chatThreadsRef.current.filter((th) => th.id !== id);
    const persisted = getPersistedThreads(filtered);
    if (persisted.length === 0) {
      const newThread = makeThread(tCopy.sidebar.defaultChatTitle);
      setChatThreads([newThread]);
      setActiveChatId(newThread.id);
      setMessages(makeInitialMessages(locale));
      restoreThreadPending(newThread.id);
      if (projectId) persistChatThreads(projectId, [], onChatPersistError);
      return;
    }
    setChatThreads(persisted);
    if (id === activeChatIdRef.current) {
      const next = persisted[0];
      setActiveChatId(next.id);
      setMessages(restoreMessages(next));
      restoreThreadPending(next.id);
    }
    if (projectId) persistChatThreads(projectId, persisted, onChatPersistError);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, locale, handleStopChat, restoreThreadPending, onChatPersistError]);

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
      persistActiveThreadNow(messagesRef.current);
    };
    window.addEventListener("beforeunload", flushOnLeave);
    window.addEventListener("pagehide", flushOnLeave);
    return () => {
      window.removeEventListener("beforeunload", flushOnLeave);
      window.removeEventListener("pagehide", flushOnLeave);
    };
  }, [projectId, persistActiveThreadNow]);



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
    const launch = logicAuditLaunchRef.current;
    if (launch) logicAuditLaunchRef.current = null;

    const raw = launch?.message ?? ctx.chatInput.trim();
    if (!raw || ctx.chatLoading || !projectId) return;
    if (
      ctx.providers.length > 0 &&
      ctx.llmProvider &&
      ctx.llmModel &&
      isSelectedModelPaid(ctx.providers, ctx.llmProvider, ctx.llmModel)
    ) {
      toast.message(t.llm.paidChatHint);
      return;
    }

    const tCopy = editorCopy(locale);
    if (!activeChatIdRef.current) {
      const initial = makeThread(tCopy.sidebar.defaultChatTitle);
      flushSync(() => {
        setChatThreads([initial]);
        setActiveChatId(initial.id);
      });
    }

    const parsed = launch
      ? { task: "logic" as const, message: launch.message, command: "logic" as const }
      : parseChatSlashCommand(raw, locale);
    const text = parsed.message;
    const activeSelection = ctx.chatSelectionContext?.text ?? ctx.selection;
    const sentSelection = ctx.chatSelectionContext;
    const casualChat = isCasualChatMessage(text);
    const task =
      ctx.chatComposerMode === "quick-edit" && !casualChat
        ? ("edit" as const)
        : parsed.task ?? undefined;
    const userDisplay =
      launch?.userDisplay ?? (parsed.command ? `/${parsed.command} · ${text}` : raw);
    const logicAuditMode =
      launch?.mode ?? parsed.logicAuditMode ?? (task === "logic" ? "quick" : undefined);
    const logicAuditScope =
      launch?.scope ?? parsed.logicAuditScope ?? (task === "logic" ? "selected" : undefined);
    const logicAuditSections = launch?.sections;
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
      sideEffects.setLogicAuditReport({ sections: [], cross_section_conflicts: [] });
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

    const CHAT_STREAM_TIMEOUT_MS = 120_000;
    let chatTimedOut = false;
    const chatTimeoutId = setTimeout(() => {
      if (!abort.signal.aborted) {
        chatTimedOut = true;
        abort.abort();
      }
    }, CHAT_STREAM_TIMEOUT_MS);

    const mainHash = contentFingerprint(sentMainLatex);
    const activeHash = contentFingerprint(sentActiveLatex);
    const latexPayload = buildChatLatexPayload(
      sentMainLatex,
      sentActiveLatex,
      sentActiveFile,
      sentMainFile,
      latexSyncRef.current,
    );

    try {
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
          llm_provider: ctx.llmProvider,
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
        {
          onActivity: (activityText) => {
            if (isProgressNoiseActivity(activityText)) return;
            pushChatStreamActivity(activityText);
          },
          onState: (state: ChatAiStatePayload) => {
            pushChatStreamState(state);
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
          onToken: (delta) => {
            const progress = getChatStreamProgressSnapshot();
            const isLogicAudit = progress.steps.some((s) => s.id.startsWith("logic-"));
            if (isLogicAudit) return;
            chatSmoothStreamRef.current?.push(delta);
          },
          onReasoning: (delta) => {
            patchAssistant((msg) => ({
              ...msg,
              reasoning: `${msg.reasoning ?? ""}${delta}`,
            }));
          },
          onLogicSection: (section) => {
            flushSync(() => {
              sideEffects.setLogicAuditReport((prev) => mergeLogicSectionReport(prev, section));
              sideEffects.setToolsOpen(true);
            });
          },
          onDone: (result) => {
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
              sideEffects.setLogicAuditReport(result.logic_audit_report);
              sideEffects.lastAuditFingerprintRef.current = logicAuditFingerprint(sentMainLatex);
              sideEffects.setToolsOpen(true);
            }
            if (result.revision_id) {
              void refreshRevisions();
            }
          },
          onError: (message) => {
            chatSmoothStreamRef.current?.dispose();
            chatSmoothStreamRef.current = null;
            patchAssistant((msg) => ({
              ...msg,
              content: message,
              isStreaming: false,
              isError: true,
            }));
          },
        },
        abort.signal,
      );
      latexSyncRef.current = nextChatLatexSync(
        latexSyncRef.current,
        mainHash,
        activeHash,
        sentActiveFile,
        latexPayload,
      );
    } finally {
      clearTimeout(chatTimeoutId);
      chatSmoothStreamRef.current?.dispose();
      chatSmoothStreamRef.current = null;
      finishChatStreamProgress();
      syncChatStreamProgress();
      setChatLoading(false);
      chatAbortRef.current = null;
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        const next = [...prev];
        const msg = next[idx] as ChatMessage;
        if (abort.signal.aborted) {
          next[idx] = {
            ...msg,
            isStreaming: false,
            content:
              msg.content.trim() ||
              (chatTimedOut
                ? t.chatStream.timeout
                : t.chatStream.stopped),
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
    t.llm.paidChatHint,
    t.chatStream.timeout,
    t.chatStream.stopped,
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
    if (chatLoading || !projectId) return;
    if (scope !== "full" && sections.length === 0) return;
    const full = scope === "full";
    const auditCopy = t.logicAudit.panelLaunch;
    logicAuditLaunchRef.current = {
      mode,
      scope,
      sections,
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
    if (autoCompile && nextActiveLatex) {
      void handleCompile(nextActiveLatex);
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
    handleCompile,
    t.pendingEdits.staleOnAccept,
    t.chatStream.acceptAppliedCompile,
    t.chatStream.acceptApplied,
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
      if (autoCompile && nextLatex) {
        void handleCompile(nextLatex);
      }
    },
    [
      pendingEdits,
      autoCompile,
      applyEditToProject,
      reportRevisionAction,
      handleCompile,
      resolveFileContent,
      mainFile,
      t.pendingEdits.staleOnAccept,
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
    if (autoCompile && nextLatex !== latex) {
      void handleCompile(nextLatex);
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
    autoCompile,
    handleCompile,
    resolveFileContent,
    reportRevisionAction,
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
      const persisted = (rawThreads ?? []).filter(isPersistedThread);
      if (persisted.length) {
        setChatThreads(persisted);
        const first = persisted[0];
        setActiveChatId(first.id);
        setMessages(restoreMessages(first));
        return persisted;
      }
      const initial = makeThread(editorCopy(locale).sidebar.defaultChatTitle);
      setChatThreads([initial]);
      setActiveChatId(initial.id);
      setMessages(makeInitialMessages(locale));
      return [];
    },
    [locale],
  );

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
      if (info) setLlmModel(info.default_model);
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
    hydrateChatFromProject,
    persistActiveThreadNow,
    chatProps,
  };
}
