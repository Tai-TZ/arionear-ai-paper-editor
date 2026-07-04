import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import { commonCopy } from "@/lib/common-i18n";
import {
  findProjectAsset,
  getCompilePayload,
  isBibFile,
  isImageAssetFile,
  isProjectAssetFile,
  isTexFile,
  normalizeAssetName,
  readFileAsDataUrl,
  type ChatThread,
  type StoredChatMessage,
  type LatexCompiler,
  type ProjectAsset,
  type ProjectFile,
} from "@/lib/project-store";
import {
  addPaperAssets,
  fetchPaper,
  updatePaper,
} from "@/lib/api/papers-api";
import {
  appendImportantFeedLine,
  applyAiState,
  compileLatex,
  type CompileMode,
  fetchCitationRegistry,
  fetchProviders,
  fetchRevisions,
  filterDisplaySteps,
  isImportantFeedEvent,
  isProgressNoiseActivity,
  isProgressNoiseStep,
  normalizeLlmProvider,
  revisionAction,
  streamChat,
  syncSession,
  verifyCitations,
  type ChatAiStatePayload,
  type LLMProvider,
  type LogicAuditReport,
  type ProviderInfo,
  type RevisionRecord,
} from "@/lib/api/academic";
import { parseChatSlashCommand } from "@/lib/chat-commands";
import { buildConversationHistory } from "@/lib/chat-history";
import {
  finishChatStreamProgress,
  getChatStreamProgressSnapshot,
  pushChatStreamActivity,
  pushChatStreamState,
  resetChatStreamProgress,
  type ChatStreamProgressSnapshot,
} from "@/lib/chat-stream-progress";
import { importOverleafZip } from "@/lib/overleaf-import";
import {
  importLatexFileList,
  mergeProjectAssets,
  mergeProjectFiles,
  type LatexImportResult,
} from "@/lib/latex-import";
import { toast } from "sonner";
import { EditorSelectionToolbar } from "@/components/editor-selection-toolbar";
import { ProjectAssetPreview } from "@/components/editor/project-asset-preview";
import type { ChatMessage } from "@/components/chat-overlay";
import type { LatexCodeEditorHandle } from "@/components/latex-code-editor";
import type { EditorSelectionContext, SelectionAnchor } from "@/lib/editor-selection-anchor";
import { clampSelectionReplacement } from "@/lib/inline-suggestion";
import { buildCompileAssetHashes } from "@/lib/compile-asset-hash";
import { COMPILE_DEBOUNCE_MS, computeCompileFingerprint, isAgentFixableCompileError } from "./lib/editor-compile";
import { isSelectedModelPaid } from "@/lib/llm-model-tier";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditorEntrySplash } from "@/components/editor-entry-splash";
import { EditorDesktopPanels } from "@/components/editor-desktop-panels";
import { resolveSynctexWordHighlight, type SynctexWordHighlight } from "@/lib/synctex-highlight";
import { useLatexHistory } from "@/lib/use-latex-history";
import { fetchDedupe, invalidateFetchKey } from "@/lib/api/fetch-dedupe";
import { llmUserErrorMsg } from "@/lib/api/api-errors";
import { createSmoothStream, type SmoothStreamController } from "@/lib/smooth-stream";
import { fetchResearcherProfile } from "@/lib/api/profile-api";
import { getCachedProfile, type ResearcherProfile } from "@/lib/researcher-profile";
import type { LogicAuditMode, LogicAuditScope } from "@/lib/logic-audit";
import { formatLogicAuditProgress, mergeLogicSectionReport, resolveLogicIssueLine } from "@/lib/logic-audit";
import { buildCitationFixPrompt, findCiteKeyLine } from "@/lib/citation-prompts";
import {
  buildEditRedoPrompt,
  buildStructureEditMessage,
  findSectionOutlineLine,
  type StructureSuggestion,
} from "@/lib/structure-suggestions";
import {
  formatPaperScoreGateError,
  logicAuditFingerprint,
  needsScoreGateAudit,
  runQuickLogicAuditForScore,
} from "@/lib/paper-score-audit";
import { hasBlockingIntegrityFlags } from "@/lib/integrity-flags";
import { fetchPaperShareStatus, type PaperShareStatus } from "@/lib/api/share-api";
import { useYjsShareSync } from "@/lib/use-yjs-share-sync";
import { ShareLinkDialog } from "@/components/editor/share-link-dialog";
import { PaperScoreDownloadDialog } from "@/components/editor/paper-score-download-dialog";
import { PdfPreviewPanel } from "@/components/pdf-preview-panel";
import { Route } from "@/routes/editor";
import type { MobileTab, PendingEdit, PendingSuggestion, ToolsTab } from "./types";
import {
  getPersistedThreads,
  isPersistedThread,
  makeInitialMessages,
  persistChatThreads,
  snapshotActiveThread,
  stripMessagesForStorage,
  threadHasUserMessages,
} from "./lib/editor-thread-storage";
import { applySingleEdit } from "./lib/editor-edit-apply";
import { parseCompileErrorLine } from "./lib/editor-project-stats";
import { toInlineSuggestion } from "./lib/editor-inline-suggestion";
import { EDITOR_SIDEBAR_STORAGE_KEY, readSidebarExpanded } from "./lib/editor-sidebar-prefs";
import { ArionearMasthead } from "./components/ArionearMasthead";
import { MobileHeader } from "./components/MobileHeader";
import { MobileTabBar } from "./components/MobileTabBar";
import { MobileBottomBar } from "./components/MobileBottomBar";
import { MobileFilesPanel } from "./components/MobileFilesPanel";
import { MobileToolsSheet } from "./components/MobileToolsSheet";
import { MobileChatSheet } from "./components/MobileChatSheet";
import { PendingEditsPanel } from "./components/PendingEditsPanel";
import { SuggestionPanel } from "@/components/suggestion-panel";
import { LeftSidebar } from "./components/LeftSidebar";
import { CenterPanel } from "./components/CenterPanel";
import { ToolsPanel } from "./components/ToolsPanel";
import { LatexEditor } from "./components/LatexEditor";
import { StatusBar } from "./components/StatusBar";
import { useEditorChat, type EditorChatSideEffects } from "./state/useEditorChat";

export function EditorWorkspace() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const shell = useMemo(() => commonCopy(locale).shell, [locale]);
  const { projectId } = Route.useSearch();
  const [sidebarTab, setSidebarTab] = useState<"files" | "chats">("files");
  const [sidebarExpanded, setSidebarExpanded] = useState(readSidebarExpanded);
  const [mobileTab, setMobileTab] = useState<MobileTab>("editor");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [splashPhase, setSplashPhase] = useState<"visible" | "exiting" | "hidden">("visible");
  const [projectName, setProjectName] = useState("");
  const {
    latex,
    setLatex,
    resetHistory,
    recordNow,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useLatexHistory("");
  const [savedLatex, setSavedLatex] = useState("");
  const isDirty = latex !== savedLatex;
  const [statusLineCount, setStatusLineCount] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStatusLineCount(latex.split("\n").length);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [latex]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [activeFile, setActiveFile] = useState("main.tex");
  const [mainFile, setMainFile] = useState("main.tex");
  const mainLatexSource = useMemo(
    () => projectFiles.find((f) => f.path === mainFile)?.content ?? latex,
    [projectFiles, mainFile, latex],
  );
  const [compiler, setCompiler] = useState<LatexCompiler>("auto");
  const [compileLog, setCompileLog] = useState<string | null>(null);
  const [synctexBase64, setSynctexBase64] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [synctexHighlight, setSynctexHighlight] = useState<SynctexWordHighlight | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileWarning, setCompileWarning] = useState<string | null>(null);
  const [autoCompile, setAutoCompile] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [synctexHighlightMs, setSynctexHighlightMs] = useState(5000);
  const [integrityStrictness, setIntegrityStrictness] =
    useState<ResearcherProfile["integrity_strictness"]>("standard");
  const profilePrefsRef = useRef<ResearcherProfile | null>(getCachedProfile());
  const t = useMemo(() => editorCopy(locale), [locale]);
  const [selection, setSelection] = useState("");
  const [selectionPick, setSelectionPick] = useState<{
    context: EditorSelectionContext;
    anchor: SelectionAnchor;
  } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<PaperShareStatus | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<RevisionRecord[]>([]);
  const [citationResults, setCitationResults] = useState<Record<string, unknown>[]>([]);
  const [citationSummary, setCitationSummary] = useState("");
  const [logicAuditReport, setLogicAuditReport] = useState<LogicAuditReport | null>(null);
  const [gateAuditReport, setGateAuditReport] = useState<LogicAuditReport | null>(null);
  const [structureSuggestions, setStructureSuggestions] = useState<StructureSuggestion[]>([]);
  const [toolsTab, setToolsTab] = useState<ToolsTab>("info");
  const [scoreAuditLoading, setScoreAuditLoading] = useState(false);
  const [scoreAuditProgress, setScoreAuditProgress] = useState<string | null>(null);
  const [scoreAuditError, setScoreAuditError] = useState<string | null>(null);
  const scoreAuditAbortRef = useRef<AbortController | null>(null);
  const lastPanelAuditFingerprintRef = useRef<string | null>(null);
  const lastGateAuditFingerprintRef = useRef<string | null>(null);
  const scoreAuditAttemptedForRef = useRef<string | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("google");
  const [llmModel, setLlmModel] = useState("gemini-3.1-flash-lite");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const latexEditorRef = useRef<LatexCodeEditorHandle>(null);
  const synctexFlashRef = useRef(0);
  const pendingSynctexRef = useRef<{
    line: number;
    word?: string;
    column?: number;
    context?: string;
    latex?: string;
  } | null>(null);
  const lastCompiledFingerprintRef = useRef<string | null>(null);
  const knownCompileAssetHashesRef = useRef<Record<string, string>>({});
  const compileInFlightRef = useRef(false);
  const pendingCompileRef = useRef<{
    latexOverride?: string;
    force?: boolean;
    mode?: CompileMode;
  } | null>(null);
  const compileAfterEditRef = useRef(false);
  const compileDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfDataRef = useRef(pdfData);
  const compileErrorRef = useRef(compileError);
  pdfDataRef.current = pdfData;
  compileErrorRef.current = compileError;

  useEffect(() => {
    let cancelled = false;
    fetchResearcherProfile()
      .then((profile) => {
        if (cancelled) return;
        profilePrefsRef.current = profile;
        setAutoCompile(profile.auto_compile);
        setAutoSave(profile.auto_save);
        setSynctexHighlightMs(profile.synctex_highlight_ms);
        setIntegrityStrictness(profile.integrity_strictness);
        // Provider/model are resolved after we fetch the server provider catalog.
        // Keep the editor default (Google/Gemini) until `loadProviders()` runs.
      })
      .catch(() => {
        const cached = getCachedProfile();
        if (!cached || cancelled) return;
        profilePrefsRef.current = cached;
        setAutoCompile(cached.auto_compile);
        setAutoSave(cached.auto_save);
        setSynctexHighlightMs(cached.synctex_highlight_ms);
        setIntegrityStrictness(cached.integrity_strictness);
        // Provider/model are resolved after we fetch the server provider catalog.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSessionAudit = useCallback(async (sessionId: string) => {
    const [revisions, citations] = await Promise.all([
      fetchRevisions(sessionId).catch(() => [] as RevisionRecord[]),
      fetchCitationRegistry(sessionId).catch(() => ({
        results: [] as Record<string, unknown>[],
        summary: "",
      })),
    ]);
    setRevisionHistory(revisions);
    setCitationResults(citations.results);
    setCitationSummary(citations.summary);
  }, []);

  const bootChatThreadsRef = useRef<ChatThread[]>([]);
  const chatHydratedForProjectRef = useRef<string | null>(null);
  const sessionSyncedRef = useRef<string | null>(null);

  const refreshRevisions = useCallback(() => {
    if (!projectId) return;
    void fetchRevisions(projectId)
      .then(setRevisionHistory)
      .catch(() => toast.error(t.errors.revisionFailed));
  }, [projectId, t.errors.revisionFailed]);

  useEffect(() => {
    if (!projectId) {
      navigate({ to: "/projects", replace: true });
      return;
    }
    let cancelled = false;
    setBootState("loading");
    setBootError(null);
    setSplashPhase("visible");

    fetchPaper(projectId)
      .then((project) => {
        if (cancelled) return;
        setProjectName(project.name);
        const normalizedMain = project.mainFile ?? "main.tex";
        setMainFile(normalizedMain);
        setActiveFile(normalizedMain);
        setProjectFiles(
          project.files?.length
            ? project.files
            : [{ path: normalizedMain, content: project.latex }],
        );
        setCompiler(project.compiler ?? "auto");
        resetHistory(project.latex);
        setSavedLatex(project.latex);
        setAssets(project.assets ?? []);
        if (project.logicAuditReport?.sections?.length) {
          setLogicAuditReport(project.logicAuditReport);
          lastPanelAuditFingerprintRef.current = logicAuditFingerprint(project.latex);
        }
        if (project.gateAuditReport?.sections?.length) {
          setGateAuditReport(project.gateAuditReport);
          lastGateAuditFingerprintRef.current = logicAuditFingerprint(project.latex);
        }
        bootChatThreadsRef.current = project.chatThreads ?? [];
        setBootState("ready");
        void loadSessionAudit(projectId);
        void fetchPaperShareStatus(projectId)
          .then((status) => {
            if (!cancelled) setShareStatus(status);
          })
          .catch(() => {
            if (!cancelled) setShareStatus(null);
          });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        invalidateFetchKey(`papers:${projectId}`);
        const message =
          error instanceof Error ? error.message : "Failed to load this project.";
        setBootError(message);
        setBootState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, navigate, resetHistory, loadSessionAudit]);

  useYjsShareSync({
    token: shareStatus?.token ?? null,
    enabled: Boolean(shareStatus?.enabled && shareStatus.token),
    latex,
    onRemoteLatex: setLatex,
  });

  const persistActiveFile = useCallback(
    (content: string, files: ProjectFile[], currentActive: string) =>
      files.map((f) => (f.path === currentActive ? { ...f, content } : f)),
    [],
  );

  const switchActiveFile = useCallback(
    (nextPath: string) => {
      if (nextPath === activeFile) return;

      const nextIsAsset = isImageAssetFile(nextPath);
      const currentIsEditable = projectFiles.some((f) => f.path === activeFile);

      let files = projectFiles;
      if (currentIsEditable) {
        files = persistActiveFile(latex, projectFiles, activeFile);
        setProjectFiles(files);
      }

      setActiveFile(nextPath);

      if (nextIsAsset) return;

      const nextFile = files.find((f) => f.path === nextPath);
      let content = nextFile?.content;

      // Fallback for .bib files previously stored as binary assets (legacy projects)
      if (content === undefined && isBibFile(nextPath)) {
        const bibAsset = assets.find((a) => normalizeAssetName(a.name) === nextPath);
        if (bibAsset?.dataUrl?.startsWith("data:")) {
          try {
            const base64 = bibAsset.dataUrl.split(",")[1] ?? "";
            content = atob(base64);
            // Migrate into projectFiles so it saves properly going forward
            const migrated = [...files, { path: nextPath, content }];
            setProjectFiles(migrated);
          } catch {
            content = "";
          }
        }
      }

      resetHistory(content ?? "");
      setSavedLatex(content ?? "");
    },
    [activeFile, assets, latex, persistActiveFile, projectFiles, resetHistory],
  );

  const openProjectFile = useCallback(
    (path: string) => {
      switchActiveFile(path);
      if (isImageAssetFile(path)) {
        setMobileTab("editor");
      }
    },
    [switchActiveFile],
  );

  const activeAsset = useMemo(
    () => (isImageAssetFile(activeFile) ? findProjectAsset(activeFile, assets) : null),
    [activeFile, assets],
  );
  const viewingAsset = isImageAssetFile(activeFile);

  useEffect(() => {
    if (bootState !== "ready") return;
    const exitTimer = window.setTimeout(() => setSplashPhase("exiting"), 160);
    const hideTimer = window.setTimeout(() => setSplashPhase("hidden"), 560);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, [bootState]);

  const showSplash = splashPhase !== "hidden";
  const showEditor = bootState === "ready";

  const persistableFile = useCallback(
    (files: ProjectFile[], currentActive: string) =>
      files.some((f) => f.path === currentActive) ? currentActive : mainFile,
    [mainFile],
  );

  const executeCompile = useCallback(
    async (
      latexOverride?: string,
      { force = false, mode }: { force?: boolean; mode?: CompileMode } = {},
    ) => {
      if (compileInFlightRef.current) {
        const nextMode: CompileMode =
          mode ?? (force || compileAfterEditRef.current ? "full" : "fast");
        const prev = pendingCompileRef.current;
        pendingCompileRef.current = {
          latexOverride,
          force: force || prev?.force,
          mode: force ? "full" : (prev?.mode ?? nextMode),
        };
        return;
      }

      const filesWithActive = persistActiveFile(
        latexOverride ?? latex,
        projectFiles,
        persistableFile(projectFiles, activeFile),
      );
      const payload = getCompilePayload({
        id: projectId ?? "",
        name: projectName,
        latex: latexOverride ?? latex,
        files: filesWithActive,
        mainFile,
        compiler,
        assets,
        createdAt: 0,
        updatedAt: 0,
      });
      const assetHashes = await buildCompileAssetHashes(payload.assets);
      const compileMode: CompileMode =
        mode ?? (force || compileAfterEditRef.current ? "full" : "fast");
      const fingerprint = computeCompileFingerprint(payload, assetHashes);
      if (
        !force &&
        fingerprint === lastCompiledFingerprintRef.current &&
        pdfDataRef.current &&
        !compileErrorRef.current
      ) {
        if (compileAfterEditRef.current) {
          compileAfterEditRef.current = false;
          toast.success(t.chatStream.compileAfterEditOk);
        }
        return;
      }

      const feedbackAfterEdit = compileAfterEditRef.current;
      let compileOk: boolean | null = null;

      compileInFlightRef.current = true;
      setIsCompiling(true);
      setCompileError(null);
      setCompileWarning(null);
      setCompileLog(null);
      try {
        const result = await compileLatex(payload.latex, payload.assets, {
          mainFile: payload.mainFile,
          compiler: payload.compiler,
          cacheId: projectId ?? undefined,
          mode: compileMode,
          knownAssetHashes: knownCompileAssetHashesRef.current,
        });
        setCompileLog(result.log || null);
        if (result.success && result.pdf_base64) {
          const binary = atob(result.pdf_base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          setPdfData(bytes);
          setPdfBase64(result.pdf_base64);
          setSynctexBase64(result.synctex_base64?.trim() || null);
          setCompileWarning(result.warning?.trim() || null);
          lastCompiledFingerprintRef.current = fingerprint;
          knownCompileAssetHashesRef.current = assetHashes;
          compileOk = true;
        } else {
          const detail = [result.error, result.log?.slice(-4000)].filter(Boolean).join("\n\n");
          setCompileError(detail || "Compilation failed.");
          compileOk = false;
        }
      } catch (error) {
        setCompileError(error instanceof Error ? error.message : "Compilation failed.");
        compileOk = false;
      } finally {
        compileInFlightRef.current = false;
        setIsCompiling(false);
        if (feedbackAfterEdit && compileOk !== null) {
          compileAfterEditRef.current = false;
          if (compileOk) {
            toast.success(t.chatStream.compileAfterEditOk);
          } else {
            toast.error(t.chatStream.compileAfterEditFail);
          }
        }
        const pending = pendingCompileRef.current;
        pendingCompileRef.current = null;
        if (pending) {
          void executeCompile(pending.latexOverride, {
            force: pending.force,
            mode: pending.mode,
          });
        }
      }
    },
    [
      latex,
      assets,
      projectFiles,
      activeFile,
      mainFile,
      compiler,
      projectId,
      projectName,
      persistActiveFile,
      persistableFile,
      t.chatStream.compileAfterEditOk,
      t.chatStream.compileAfterEditFail,
    ],
  );

  const markCompileAfterEdit = useCallback(() => {
    compileAfterEditRef.current = true;
  }, []);

  const scheduleCompile = useCallback(
    (latexOverride?: string) => {
      if (compileDebounceRef.current) {
        clearTimeout(compileDebounceRef.current);
      }
      compileDebounceRef.current = setTimeout(() => {
        compileDebounceRef.current = null;
        void executeCompile(latexOverride);
      }, COMPILE_DEBOUNCE_MS);
    },
    [executeCompile],
  );

  const handleCompile = useCallback(
    (latexOverride?: string) => {
      if (compileDebounceRef.current) {
        clearTimeout(compileDebounceRef.current);
        compileDebounceRef.current = null;
      }
      return executeCompile(latexOverride, { force: true });
    },
    [executeCompile],
  );

  useEffect(() => {
    lastCompiledFingerprintRef.current = null;
    knownCompileAssetHashesRef.current = {};
    pendingCompileRef.current = null;
    if (compileDebounceRef.current) {
      clearTimeout(compileDebounceRef.current);
      compileDebounceRef.current = null;
    }
  }, [projectId]);

  useEffect(
    () => () => {
      if (compileDebounceRef.current) {
        clearTimeout(compileDebounceRef.current);
      }
    },
    [],
  );

  const chatSideEffects = useMemo<EditorChatSideEffects>(
    () => ({
      setToolsOpen,
      setToolsTab,
      setLogicAuditReport,
      setCitationResults,
      setCitationSummary,
      setStructureSuggestions,
      lastPanelAuditFingerprintRef,
    }),
    [],
  );

  const chat = useEditorChat({
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
    scheduleCompile,
    compileNow: handleCompile,
    onCompileAfterEdit: markCompileAfterEdit,
    setMobileChatOpen,
    scoreAuditLoading,
    sideEffects: chatSideEffects,
  });

  const {
    messages,
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
    handleAcceptEdit,
    handleRejectEdit,
    handleAcceptAllEdits,
    handleRejectAllEdits,
    handleAcceptSuggestion,
    handleRejectSuggestion,
    runLogicAuditFromPanel,
    runAgentEdit,
    hydrateChatFromProject,
    persistActiveThreadNow,
    chatProps,
  } = chat;

  const applyStructureFix = useCallback(
    (suggestion: StructureSuggestion) => {
      const section = (suggestion.section ?? "").trim();
      const message = buildStructureEditMessage(suggestion);
      const display = section
        ? locale === "vi"
          ? `/edit · Sửa ngay: ${section}`
          : `/edit · Apply fix: ${section}`
        : `/edit · ${message.slice(0, 56)}`;
      runAgentEdit(message, display);
      setMobileToolsOpen(false);
      openChatPanel();
    },
    [runAgentEdit, locale, openChatPanel],
  );

  const auditReportStale = useMemo(
    () =>
      Boolean(
        logicAuditReport?.sections?.length &&
          lastPanelAuditFingerprintRef.current &&
          logicAuditFingerprint(mainLatexSource) !== lastPanelAuditFingerprintRef.current,
      ),
    [logicAuditReport, mainLatexSource],
  );

  const logicAuditProgressDetail = useMemo(
    () => (auditInProgress ? formatLogicAuditProgress(chatStreamProgress) : null),
    [auditInProgress, chatStreamProgress],
  );

  useEffect(() => {
    chatHydratedForProjectRef.current = null;
    sessionSyncedRef.current = null;
  }, [projectId]);

  useEffect(() => {
    if (bootState !== "ready" || !projectId) return;
    if (chatHydratedForProjectRef.current === projectId) return;
    chatHydratedForProjectRef.current = projectId;
    const persisted = hydrateChatFromProject(bootChatThreadsRef.current);
    if (persisted.length < bootChatThreadsRef.current.length) {
      persistChatThreads(projectId, persisted);
    }
  }, [bootState, hydrateChatFromProject, projectId]);


  const handleSave = useCallback(() => {
    if (!projectId) return;
    persistActiveThreadNow();
    const files = persistActiveFile(
      latex,
      projectFiles,
      persistableFile(projectFiles, activeFile),
    );
    setProjectFiles(files);
    const mainContent = files.find((f) => f.path === mainFile)?.content ?? latex;
    updatePaper(
      projectId,
      {
        name: projectName,
        latex: mainContent,
        files,
        mainFile,
        compiler,
        assets,
      },
      { immediate: true },
    )
      .then(() => {
        setSavedLatex(latex);
        syncSession(projectId, projectName, mainContent).catch(() => {
          toast.error(t.errors.syncFailed);
        });
        if (autoCompile) {
          scheduleCompile(latex);
        }
      })
      .catch(() => {
        toast.error(t.errors.saveFailed);
      });
  }, [
    projectId,
    projectName,
    latex,
    projectFiles,
    activeFile,
    mainFile,
    compiler,
    assets,
    autoCompile,
    scheduleCompile,
    persistActiveFile,
    persistableFile,
    persistActiveThreadNow,
    t.errors.saveFailed,
    t.errors.syncFailed,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave, undo, redo]);

  useEffect(() => {
    if (bootState !== "ready" || !projectId) return;
    if (sessionSyncedRef.current === projectId) return;
    sessionSyncedRef.current = projectId;
    void fetchDedupe(`session:init:${projectId}`, () =>
      syncSession(projectId, projectName, mainLatexSource),
    ).catch(() => {
      toast.error(t.errors.syncFailed);
    });
  }, [bootState, projectId, projectName, mainLatexSource, t.errors.syncFailed]);

  const loadProviders = useCallback(() => {
    fetchProviders()
      .then((data) => {
        setProviders(data.providers);
        // Editor default: prefer Google Gemini when configured on the server.
        const preferred = data.providers.some((p) => p.id === "google")
          ? "google"
          : normalizeLlmProvider(data.default_provider);
        setLlmProvider(preferred);
        const providerInfo = data.providers.find((p) => p.id === preferred);
        if (providerInfo) {
          // Use Gemini 2.5 Flash when available; otherwise fall back to provider default.
          const googleDefault = "gemini-3.1-flash-lite";
          if (
            preferred === "google" &&
            providerInfo.models.some((m) => m.id === googleDefault)
          ) {
            setLlmModel(googleDefault);
          } else {
            setLlmModel(providerInfo.default_model);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (bootState !== "ready" || !projectId || !autoSave || !isDirty) return;
    const timer = window.setTimeout(() => {
      handleSave();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [bootState, projectId, autoSave, isDirty, latex, handleSave]);

  const logicAuditEngineAvailable = useMemo(
    () => providers.some((p) => p.id === "google"),
    [providers],
  );

  const SCORE_AUDIT_TIMEOUT_MS = 150_000;

  const runScoreGateAudit = useCallback(async () => {
    if (!projectId || scoreAuditLoading || auditInProgress) return;

    scoreAuditAbortRef.current?.abort();
    const abort = new AbortController();
    scoreAuditAbortRef.current = abort;

    setScoreAuditLoading(true);
    setScoreAuditError(null);
    setScoreAuditProgress(editorCopy(locale).scoreGate.hintLoading);

    const timeoutId = setTimeout(() => {
      if (!abort.signal.aborted) {
        abort.abort();
        setScoreAuditLoading(false);
        setScoreAuditProgress(null);
        setScoreAuditError(
          locale === "vi"
            ? "Phản biện AI quá thời gian — thử lại hoặc chọn bài ngắn hơn."
            : "AI review timed out — try again or use a shorter manuscript.",
        );
      }
    }, SCORE_AUDIT_TIMEOUT_MS);

    try {
      const report = await runQuickLogicAuditForScore({
        latex: mainLatexSource,
        sessionId: projectId,
        integrityStrictness,
        llmProvider,
        llmModel,
        signal: abort.signal,
        onProgress: (label) => setScoreAuditProgress(label),
      });
      if (abort.signal.aborted) return;
      scoreAuditAttemptedForRef.current = logicAuditFingerprint(mainLatexSource);
      if (report?.sections?.length) {
        setGateAuditReport(report);
        lastGateAuditFingerprintRef.current = logicAuditFingerprint(mainLatexSource);
      } else {
        setGateAuditReport(null);
        setScoreAuditError(
          locale === "vi"
            ? "Không nhận được báo cáo phản biện — điểm dựa trên tiêu chí kỹ thuật."
            : "No peer review report — score uses technical criteria only.",
        );
      }
    } catch (error) {
      if (abort.signal.aborted) return;
      const message =
        error instanceof Error ? error.message : "Không thể chạy phản biện AI.";
      setGateAuditReport(null);
      setScoreAuditError(formatPaperScoreGateError(message));
    } finally {
      clearTimeout(timeoutId);
      if (!abort.signal.aborted) {
        setScoreAuditLoading(false);
        setScoreAuditProgress(null);
      }
      scoreAuditAbortRef.current = null;
    }
  }, [
    projectId,
    scoreAuditLoading,
    mainLatexSource,
    integrityStrictness,
    llmProvider,
    llmModel,
    locale,
    auditInProgress,
  ]);

  useEffect(() => {
    if (!exportOpen) {
      scoreAuditAbortRef.current?.abort();
      scoreAuditAbortRef.current = null;
      scoreAuditAttemptedForRef.current = null;
      setScoreAuditLoading(false);
      setScoreAuditProgress(null);
      return;
    }
    if (!projectId || scoreAuditLoading || auditInProgress) return;

    const fingerprint = logicAuditFingerprint(mainLatexSource);
    if (scoreAuditAttemptedForRef.current === fingerprint) return;
    if (
      !needsScoreGateAudit(
        mainLatexSource,
        gateAuditReport,
        lastGateAuditFingerprintRef.current,
      )
    ) {
      return;
    }
    void runScoreGateAudit();
  }, [
    exportOpen,
    projectId,
    mainLatexSource,
    gateAuditReport,
    scoreAuditLoading,
    auditInProgress,
    runScoreGateAudit,
  ]);

  const applyImportedFiles = useCallback(
    async (imported: LatexImportResult, replaceProject = false) => {
      if (!projectId) return;

      const filesWithActive = persistActiveFile(latex, projectFiles, activeFile);
      const isLikelyBlank =
        projectFiles.length <= 1 &&
        (mainFile === "main.tex" || mainFile === activeFile) &&
        (latex.trim().length < 400 || /\\title\{Untitled\}/.test(latex));

      const mergedFiles = replaceProject
        ? imported.files
        : mergeProjectFiles(filesWithActive, imported.files);
      const mergedAssets = replaceProject
        ? imported.assets
        : mergeProjectAssets(assets, imported.assets);
      const nextMain =
        replaceProject || isLikelyBlank ? imported.mainFile : mainFile;
      const openPath = imported.mainFile;
      const openContent =
        mergedFiles.find((f) => f.path === openPath)?.content ??
        mergedFiles.find((f) => f.path === nextMain)?.content ??
        "";
      const mainContent =
        mergedFiles.find((f) => f.path === nextMain)?.content ?? openContent;
      const nextName = replaceProject ? imported.name : projectName;
      const nextCompiler =
        replaceProject || imported.compiler !== "auto" ? imported.compiler : compiler;

      setProjectFiles(mergedFiles);
      setMainFile(nextMain);
      setActiveFile(openPath);
      setCompiler(nextCompiler);
      resetHistory(openContent);
      setSavedLatex(openContent);
      if (replaceProject) setProjectName(imported.name);

      let updated = await updatePaper(projectId, {
        name: nextName,
        latex: mainContent,
        files: mergedFiles,
        mainFile: nextMain,
        compiler: nextCompiler,
      });

      const assetsToUpload = replaceProject ? mergedAssets : imported.assets;
      const batchSize = 8;
      for (let i = 0; i < assetsToUpload.length; i += batchSize) {
        updated = await addPaperAssets(projectId, assetsToUpload.slice(i, i + batchSize));
      }

      setAssets(updated.assets ?? mergedAssets);
      knownCompileAssetHashesRef.current = {};
      lastCompiledFingerprintRef.current = null;
      void syncSession(projectId, nextName, mainContent);
    },
    [
      projectId,
      latex,
      projectFiles,
      activeFile,
      mainFile,
      assets,
      projectName,
      compiler,
      persistActiveFile,
      resetHistory,
    ],
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !projectId) return;

    setUploadStatus(locale === "vi" ? "Đang upload…" : "Uploading…");
    try {
      const imported = await importLatexFileList(files);
      await applyImportedFiles(imported, false);
      toast.success(
        locale === "vi"
          ? `Đã nhập ${imported.files.length} file thành công.`
          : `Imported ${imported.files.length} file(s).`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : locale === "vi" ? "Tải lên thất bại." : "Upload failed.",
      );
    } finally {
      setUploadStatus(null);
    }
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !projectId) return;

    setUploadStatus(locale === "vi" ? "Đang upload…" : "Uploading…");
    try {
      const imported = await importOverleafZip(file);
      await applyImportedFiles(imported, true);
      toast.success(
        locale === "vi"
          ? `Đã nhập dự án "${imported.name}".`
          : `Imported project "${imported.name}".`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : locale === "vi" ? "Nhập ZIP thất bại." : "ZIP import failed.",
      );
    } finally {
      setUploadStatus(null);
    }
  };

  const jumpToSynctex = useCallback(
    (line: number, word?: string, column?: number, sourceLatex?: string, context?: string) => {
      const content = sourceLatex ?? latex;
      const highlight = resolveSynctexWordHighlight(content, line, word, column, 5, context);
      const targetLine = highlight?.line ?? line;
      const flashToken = ++synctexFlashRef.current;

      setMobileTab("editor");
      setHighlightLine(targetLine);
      setSynctexHighlight(highlight);

      const scroll = () =>
        latexEditorRef.current?.scrollToLine(
          targetLine,
          highlight?.start,
          highlight?.end,
        );
      requestAnimationFrame(scroll);
      window.setTimeout(scroll, 80);
      window.setTimeout(scroll, 220);
      window.setTimeout(scroll, 360);

      window.setTimeout(() => {
        if (synctexFlashRef.current !== flashToken) return;
        setHighlightLine(null);
        setSynctexHighlight(null);
      }, synctexHighlightMs);
    },
    [latex, synctexHighlightMs],
  );

  const jumpToOutlineLine = useCallback((line: number) => {
    setMobileTab("editor");
    setHighlightLine(line);
    setSynctexHighlight(null);
    const scroll = () => latexEditorRef.current?.scrollToLine(line);
    requestAnimationFrame(scroll);
    window.setTimeout(scroll, 80);
  }, []);

  const handleRenameProject = useCallback(
    async (name: string) => {
      if (!projectId) return;
      setProjectName(name);
      await updatePaper(projectId, { name });
    },
    [projectId],
  );

  useEffect(() => {
    const pending = pendingSynctexRef.current;
    if (!pending) return;
    pendingSynctexRef.current = null;
    const timer = window.setTimeout(
      () => jumpToSynctex(pending.line, pending.word, pending.column, pending.latex, pending.context),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [activeFile, jumpToSynctex]);

  const handleSynctexHit = useCallback(
    (file: string, line: number, word?: string, column?: number, context?: string) => {
      const normalized = normalizeAssetName(file.replace(/\\/g, "/"));
      const basename = normalized.split("/").pop() ?? normalized;
      const target = projectFiles.find(
        (f) =>
          f.path === normalized ||
          f.path.endsWith(`/${normalized}`) ||
          f.path.endsWith(`/${basename}`) ||
          f.path.split("/").pop() === basename,
      );

      if (target && target.path !== activeFile) {
        pendingSynctexRef.current = { line, word, column, context, latex: target.content };
        switchActiveFile(target.path);
        return;
      }

      jumpToSynctex(line, word, column, undefined, context);
    },
    [projectFiles, activeFile, switchActiveFile, jumpToSynctex],
  );

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !projectId) return;

    const assetFiles = files.filter((f) => isProjectAssetFile(f.name));
    if (!assetFiles.length) return;

    setUploadStatus(locale === "vi" ? "Đang upload…" : "Uploading…");
    try {
      const uploaded = await Promise.all(assetFiles.map(readFileAsDataUrl));
      const updated = await addPaperAssets(projectId, uploaded);
      if (updated.assets) setAssets(updated.assets);
      toast.success(
        locale === "vi"
          ? `Đã tải ${assetFiles.length} tài nguyên.`
          : `Uploaded ${assetFiles.length} asset(s).`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : locale === "vi" ? "Tải tài nguyên thất bại." : "Asset upload failed.",
      );
    } finally {
      setUploadStatus(null);
    }
    e.target.value = "";
  };

  const jumpToStructureSection = useCallback(
    (sectionName: string) => {
      const line = findSectionOutlineLine(mainLatexSource, sectionName);
      if (mainFile !== activeFile) {
        switchActiveFile(mainFile);
      }
      if (line) jumpToOutlineLine(line);
    },
    [mainLatexSource, mainFile, activeFile, switchActiveFile, jumpToOutlineLine],
  );

  const jumpToCitation = useCallback(
    (citeKey: string) => {
      const line = findCiteKeyLine(mainLatexSource, citeKey);
      if (mainFile !== activeFile) {
        switchActiveFile(mainFile);
      }
      if (line) jumpToOutlineLine(line);
    },
    [mainLatexSource, mainFile, activeFile, switchActiveFile, jumpToOutlineLine],
  );

  const askArioCitation = useCallback(
    (prefill: string, citeKey?: string) => {
      if (citeKey?.trim()) {
        jumpToCitation(citeKey);
      }
      queueChatFollowUp(prefill);
    },
    [jumpToCitation, queueChatFollowUp],
  );

  const jumpToLogicIssue = useCallback(
    (sectionName: string, excerpt?: string) => {
      const line = resolveLogicIssueLine(mainLatexSource, sectionName, excerpt);
      if (mainFile !== activeFile) {
        switchActiveFile(mainFile);
      }
      if (line) jumpToOutlineLine(line);
    },
    [mainLatexSource, mainFile, activeFile, switchActiveFile, jumpToOutlineLine],
  );

  const canJumpToLogicIssue = useCallback(
    (sectionName: string, excerpt?: string) =>
      resolveLogicIssueLine(mainLatexSource, sectionName, excerpt) != null,
    [mainLatexSource],
  );

  const askArioLogicIssue = useCallback(
    (prefill: string, sectionName: string, excerpt?: string) => {
      jumpToLogicIssue(sectionName, excerpt);
      queueChatFollowUp(prefill);
    },
    [jumpToLogicIssue, queueChatFollowUp],
  );

  const canJumpToStructureSection = useCallback(
    (sectionName: string) => findSectionOutlineLine(mainLatexSource, sectionName) != null,
    [mainLatexSource],
  );

  const handleSelectionContextChange = useCallback(
    (payload: { context: EditorSelectionContext; anchor: SelectionAnchor } | null) => {
      setSelectionPick(payload);
    },
    [],
  );

  const openQuickEditFromPick = useCallback(
    (pick: { context: EditorSelectionContext; anchor: SelectionAnchor }) => {
      setChatSelectionContext(pick.context);
      setSelection(pick.context.text);
      setChatComposerMode("quick-edit");
      openChatPanel();
      setSelectionPick(null);
    },
    [openChatPanel, setChatSelectionContext, setChatComposerMode, setSelection],
  );

  const handleAddSelectionToChat = useCallback(() => {
    if (!selectionPick) return;
    setChatSelectionContext(selectionPick.context);
    setSelection(selectionPick.context.text);
    setChatComposerMode("normal");
    openChatPanel();
    setSelectionPick(null);
  }, [selectionPick, openChatPanel]);

  const handleQuickEditSelection = useCallback(() => {
    if (!selectionPick) return;
    openQuickEditFromPick(selectionPick);
  }, [selectionPick, openQuickEditFromPick]);

  const handleAskArioFixCompile = useCallback(() => {
    if (!compileError || !isAgentFixableCompileError(compileError)) return;
    const line = parseCompileErrorLine(compileError);
    setChatComposerMode("quick-edit");
    setChatSelectionContext(null);
    setSelection("");
    setChatInput(`Fix this LaTeX compile error:\n\n${compileError.slice(0, 1500)}`);
    if (line) setHighlightLine(line);
    openChatPanel();
  }, [compileError, openChatPanel, setChatInput]);

  const canAskArioFixCompile = Boolean(
    compileError && isAgentFixableCompileError(compileError),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(".latex-input")) return;
      if (!selectionPick?.context.text.trim()) return;
      e.preventDefault();
      handleQuickEditSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionPick, handleQuickEditSelection]);

  return (
    <div className="editor-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      {uploadStatus && (
        <div className="upload-blocking-overlay">
          <div className="upload-blocking-card">
            <p className="upload-blocking-msg">{uploadStatus}</p>
            <div className="upload-progress-track" role="progressbar" aria-label={uploadStatus}>
              <div className="upload-progress-bar" />
            </div>
          </div>
        </div>
      )}
      {bootState === "error" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-serif-body text-lg font-semibold">Could not open project</p>
          <p className="max-w-md text-sm text-muted-foreground">{bootError}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!projectId) return;
                setBootState("loading");
                setBootError(null);
                invalidateFetchKey(`papers:${projectId}`);
                fetchPaper(projectId)
                  .then((project) => {
                    setProjectName(project.name);
                    const normalizedMain = project.mainFile ?? "main.tex";
                    setMainFile(normalizedMain);
                    setActiveFile(normalizedMain);
                    setProjectFiles(
                      project.files?.length
                        ? project.files
                        : [{ path: normalizedMain, content: project.latex }],
                    );
                    setCompiler(project.compiler ?? "auto");
                    resetHistory(project.latex);
                    setSavedLatex(project.latex);
                    setAssets(project.assets ?? []);
                    setBootState("ready");
                  })
                  .catch((error: unknown) => {
                    setBootError(
                      error instanceof Error ? error.message : "Failed to load this project.",
                    );
                    setBootState("error");
                  });
              }}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Retry
            </button>
            <Link
              to="/projects"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to projects
            </Link>
          </div>
        </div>
      )}
      {bootState !== "error" && showSplash && (
        <EditorEntrySplash
          exiting={splashPhase === "exiting"}
          label={bootState === "loading" ? shell.loadingProject : shell.openingEditor}
        />
      )}
      {bootState !== "error" && showEditor && (
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden${
            showSplash ? " invisible" : ""
          }`}
        >
      <ArionearMasthead integrityStrictness={integrityStrictness} className="hidden md:flex" />
      <MobileHeader
        projectName={projectName}
        onUpload={() => fileInputRef.current?.click()}
        onExport={() => setExportOpen(true)}
        exportEnabled={Boolean(pdfData)}
      />
      <MobileTabBar tab={mobileTab} onChange={setMobileTab} />

      <input
        ref={zipInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleZipImport}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".tex,.latex,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.eps,.cls,.bst,.sty,.bib"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={handleUpload}
      />
      <input
        ref={assetInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.eps,.cls,.bst,.sty,.bib"
        multiple
        className="hidden"
        onChange={handleAssetUpload}
      />

      {/* Desktop layout */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        <LeftSidebar
          projectName={projectName}
          outlineLatex={mainLatexSource}
          highlightLine={highlightLine}
          onRenameProject={handleRenameProject}
          onOutlineJump={jumpToOutlineLine}
          files={projectFiles}
          activeFile={activeFile}
          mainFile={mainFile}
          assets={assets}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          expanded={sidebarExpanded}
          onExpandedChange={(next) => {
            setSidebarExpanded(next);
            window.localStorage.setItem(
              EDITOR_SIDEBAR_STORAGE_KEY,
              next ? "expanded" : "collapsed",
            );
          }}
          onSelectFile={openProjectFile}
          onUpload={() => fileInputRef.current?.click()}
          onUploadFolder={() => folderInputRef.current?.click()}
          onUploadZip={() => zipInputRef.current?.click()}
          onUploadAsset={() => assetInputRef.current?.click()}
          isDirty={isDirty}
          chatThreads={chatThreads}
          activeChatId={activeChatId}
          onNewChat={handleNewChat}
          onSwitchChat={handleSwitchChat}
          onRenameChat={handleRenameChat}
          onDeleteChat={handleDeleteChat}
        />
        <EditorDesktopPanels
          center={
            <CenterPanel
              latex={latex}
              activeFile={activeFile}
              activeAsset={activeAsset}
              viewingAsset={viewingAsset}
              highlightLine={highlightLine}
              synctexHighlight={synctexHighlight}
              editorRef={latexEditorRef}
              onLatexChange={setLatex}
              onSelectionChange={setSelection}
              onSelectionContextChange={handleSelectionContextChange}
              selectionPick={selectionPick}
              onAddSelectionToChat={handleAddSelectionToChat}
              onQuickEditSelection={handleQuickEditSelection}
              onDismissSelectionToolbar={() => setSelectionPick(null)}
              onQuickEditRequest={openQuickEditFromPick}
              chatOpen={chatOpen}
              toolsOpen={toolsOpen}
              onToggleTools={() => setToolsOpen((v) => !v)}
              onShare={() => setShareOpen(true)}
              onExport={() => setExportOpen(true)}
              onDefense={projectId ? () => void navigate({ to: "/defense", search: { projectId } }) : undefined}
              exportEnabled={Boolean(pdfData)}
              shareEnabled={Boolean(shareStatus?.enabled)}
              pendingEdits={pendingEdits}
              activeEditId={activeEditId}
              onSelectEdit={setActiveEditId}
              onAcceptEdit={handleAcceptEdit}
              onRejectEdit={handleRejectEdit}
              onAcceptAllEdits={handleAcceptAllEdits}
              onRejectAllEdits={handleRejectAllEdits}
              mainFile={mainFile}
              resolveFileContent={resolveFileContent}
              {...chatProps}
            />
          }
          right={
            toolsOpen ? (
              <ToolsPanel
                latex={mainLatexSource}
                projectId={projectId ?? ""}
                autoCompile={autoCompile}
                onAutoCompileChange={setAutoCompile}
                revisions={revisionHistory}
                citationResults={citationResults}
                citationSummary={citationSummary}
                logicAuditReport={logicAuditReport}
                structureSuggestions={structureSuggestions}
                toolsTab={toolsTab}
                onToolsTabChange={setToolsTab}
                onJumpToStructureSection={jumpToStructureSection}
                canJumpToStructureSection={canJumpToStructureSection}
                onAskArioStructure={queueChatFollowUp}
                onApplyStructureFix={applyStructureFix}
                onAskArioCitation={askArioCitation}
                onRunLogicAudit={runLogicAuditFromPanel}
                logicAuditLoading={auditInProgress}
                logicAuditReportStale={auditReportStale}
                logicAuditProgressDetail={logicAuditProgressDetail}
                logicAuditSectionProgress={auditSectionProgress}
                logicAuditEngineAvailable={logicAuditEngineAvailable}
                onCancelLogicAudit={handleStopChat}
                onJumpToLogicIssue={jumpToLogicIssue}
                onAskArioLogic={askArioLogicIssue}
                canJumpToLogicIssue={canJumpToLogicIssue}
                onCitationsUpdated={(results, summary) => {
                  setCitationResults(results);
                  setCitationSummary(summary);
                }}
                onClose={() => setToolsOpen(false)}
              />
            ) : (
              <PdfPreviewPanel
                pdfData={pdfData}
                isCompiling={isCompiling}
                compileError={compileError}
                compileWarning={compileWarning}
                compileLog={compileLog}
                synctexBase64={synctexBase64}
                pdfBase64={pdfBase64}
                mainFile={mainFile}
                compiler={compiler}
                onCompilerChange={(value) => {
                  setCompiler(value);
                  if (projectId) {
                    updatePaper(projectId, { compiler: value }).catch(() => {});
                  }
                }}
                onSynctexHit={handleSynctexHit}
                onCompile={() => void handleCompile()}
                onAskArioFix={canAskArioFixCompile ? handleAskArioFixCompile : undefined}
                latexSource={mainLatexSource}
                projectName={projectName}
              />
            )
          }
        />
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col overflow-hidden">
        {mobileTab === "files" && (
          <MobileFilesPanel
            projectName={projectName}
            outlineLatex={mainLatexSource}
            highlightLine={highlightLine}
            onRenameProject={handleRenameProject}
            onOutlineJump={jumpToOutlineLine}
            files={projectFiles}
            activeFile={activeFile}
            mainFile={mainFile}
            assets={assets}
            onSelectFile={openProjectFile}
            onUpload={() => fileInputRef.current?.click()}
            onUploadFolder={() => folderInputRef.current?.click()}
            onUploadZip={() => zipInputRef.current?.click()}
            isDirty={isDirty}
            chatThreads={chatThreads}
            activeChatId={activeChatId}
            onNewChat={handleNewChat}
            onSwitchChat={(id) => {
              handleSwitchChat(id);
              setMobileChatOpen(true);
            }}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
          />
        )}
        {mobileTab === "editor" && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {viewingAsset ? (
              activeAsset ? (
                <ProjectAssetPreview path={activeFile} asset={activeAsset} />
              ) : (
                <div className="project-asset-preview-missing p-6 text-sm text-muted-foreground">
                  {editorCopy(locale).assetPreview.missing}
                </div>
              )
            ) : (
              <>
            <LatexEditor
              editorRef={latexEditorRef}
              latex={latex}
              onLatexChange={setLatex}
              onSelectionChange={setSelection}
              onSelectionContextChange={handleSelectionContextChange}
              onQuickEditRequest={openQuickEditFromPick}
              fullHeight
              highlightLine={highlightLine}
              synctexHighlight={synctexHighlight}
              inlineSuggestion={toInlineSuggestion(pendingEdits, activeEditId, pendingSuggestion)}
            />
            {selectionPick && (
              <EditorSelectionToolbar
                context={selectionPick.context}
                anchor={selectionPick.anchor}
                onAddToChat={handleAddSelectionToChat}
                onQuickEdit={handleQuickEditSelection}
                onDismiss={() => setSelectionPick(null)}
              />
            )}
            {pendingEdits?.length ? (
              <PendingEditsPanel
                pendingEdits={pendingEdits}
                activeEditId={activeEditId}
                mainFile={mainFile}
                resolveFileContent={resolveFileContent}
                onSelectEdit={setActiveEditId}
                onAcceptEdit={handleAcceptEdit}
                onRejectEdit={handleRejectEdit}
                onAcceptAll={handleAcceptAllEdits}
                onRejectAll={handleRejectAllEdits}
              />
            ) : pendingSuggestion ? (
              <SuggestionPanel
                originalText={pendingSuggestion.originalText}
                suggestion={pendingSuggestion.suggestion}
                diff={pendingSuggestion.diff}
                flags={pendingSuggestion.flags}
                applyMode={pendingSuggestion.applyMode}
                onAccept={handleAcceptSuggestion}
                onReject={handleRejectSuggestion}
              />
            ) : null}
              </>
            )}
          </div>
        )}
        {mobileTab === "preview" && (
          <PdfPreviewPanel
            pdfData={pdfData}
            isCompiling={isCompiling}
            compileError={compileError}
            compileWarning={compileWarning}
            compileLog={compileLog}
            synctexBase64={synctexBase64}
            pdfBase64={pdfBase64}
            mainFile={mainFile}
            compiler={compiler}
            onCompilerChange={setCompiler}
            onSynctexHit={handleSynctexHit}
            onCompile={() => void handleCompile()}
            onAskArioFix={canAskArioFixCompile ? handleAskArioFixCompile : undefined}
            projectName={projectName}
            latexSource={mainLatexSource}
            mobile
          />
        )}
      </div>

      <MobileBottomBar
        activeFile={activeFile}
        onOpenFiles={() => setMobileTab("files")}
        onOpenTools={() => setMobileToolsOpen(true)}
        onOpenChat={() => setMobileChatOpen(true)}
        isDirty={isDirty}
      />
      {mobileChatOpen && (
        <MobileChatSheet onClose={() => setMobileChatOpen(false)} {...chatProps} />
      )}
      {mobileToolsOpen && projectId && (
        <MobileToolsSheet
          onClose={() => setMobileToolsOpen(false)}
          latex={mainLatexSource}
          projectId={projectId}
          autoCompile={autoCompile}
          onAutoCompileChange={setAutoCompile}
          revisions={revisionHistory}
          citationResults={citationResults}
          citationSummary={citationSummary}
          logicAuditReport={logicAuditReport}
          structureSuggestions={structureSuggestions}
          toolsTab={toolsTab}
          onToolsTabChange={setToolsTab}
          onJumpToStructureSection={jumpToStructureSection}
          canJumpToStructureSection={canJumpToStructureSection}
          onAskArioStructure={queueChatFollowUp}
          onApplyStructureFix={applyStructureFix}
          onAskArioCitation={askArioCitation}
          onRunLogicAudit={runLogicAuditFromPanel}
          logicAuditLoading={auditInProgress}
          logicAuditReportStale={auditReportStale}
          logicAuditProgressDetail={logicAuditProgressDetail}
          logicAuditSectionProgress={auditSectionProgress}
          logicAuditEngineAvailable={logicAuditEngineAvailable}
          onCancelLogicAudit={handleStopChat}
          onJumpToLogicIssue={jumpToLogicIssue}
          onAskArioLogic={askArioLogicIssue}
          canJumpToLogicIssue={canJumpToLogicIssue}
          onCitationsUpdated={(results, summary) => {
            setCitationResults(results);
            setCitationSummary(summary);
          }}
        />
      )}

      <StatusBar lineCount={statusLineCount} className="hidden md:flex" />
      {projectId ? (
        <ShareLinkDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          paperId={projectId}
          onStatusChange={setShareStatus}
        />
      ) : null}
      <PaperScoreDownloadDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectName={projectName}
        latex={mainLatexSource}
        pdfData={pdfData}
        compileError={compileError}
        citationResults={citationResults}
        logicAuditReport={gateAuditReport}
        auditLoading={scoreAuditLoading}
        auditProgress={scoreAuditProgress}
        auditError={scoreAuditError}
      />
        </div>
      )}
    </div>
  );
}
