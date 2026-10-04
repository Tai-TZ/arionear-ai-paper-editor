import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { fetchPaper } from "@/lib/api/papers-api";
import { invalidateFetchKey } from "@/lib/api/fetch-dedupe";
import { compileLatex, type CompileResult } from "@/lib/api/academic";
import { buildCompileAssetHashes } from "@/lib/compile-asset-hash";
import { computeCompileFingerprint } from "@/features/editor/lib/editor-compile";
import { getSession } from "@/lib/auth-store";
import {
  buildDefenseLatexContext,
  getCompilePayload,
  type LatexCompiler,
  type ProjectAsset,
  type ProjectFile,
  type StoredProject,
} from "@/lib/project-store";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { EditorDesktopPanels } from "@/components/editor-desktop-panels";
import { PdfPreviewPanel } from "@/components/pdf-preview-panel";
import { useLocale } from "@/components/locale-provider";
import { DefenseMastheadPrefs } from "@/components/defense/defense-masthead-prefs";
import {
  DefenseMobileTabBar,
  type DefenseMobileTab,
} from "@/components/defense/defense-mobile-tab-bar";
import {
  DefensePdfStatusBar,
  type DefensePdfStatus,
} from "@/components/defense/defense-pdf-status-bar";
import {
  DefenseChatPanel,
  DefenseQuotaBadge,
  buildDefenseConversationHistory,
  countCompletedCouncilTurns,
  type DefenseMessage,
} from "@/components/defense/defense-chat-panel";
import { defenseCopy, formatDefenseQuotaError, isDefenseQuotaError } from "@/lib/defense-i18n";
import {
  fetchDefenseQuota,
  streamDefense,
  DEFENSE_QUOTA_ENABLED,
  type DefenseConversationTurn,
  type DefenseQuota,
} from "@/lib/api/defense-api";
import { fetchBillingStatus } from "@/lib/api/billing-api";
import type { DefensePdfCitation, DefensePdfCitationFocus } from "@/lib/defense-pdf-links";
import { resolveDefensePdfCitation } from "@/lib/defense-pdf-citation-resolve";
import { prepareDefenseCouncilMarkdown } from "@/lib/defense-pdf-autolink";
import {
  clearDefenseSession,
  flushDefenseSessionPersistNow,
  loadLocalDefenseSession,
  mergeDefenseSessions,
  persistDefenseSession,
  type StoredDefenseSession,
} from "@/lib/defense-session-storage";

// Module-level PDF cache (survives SPA navigation within the same tab).
// Keyed by compile fingerprint so stale PDFs are never served after edits.
const _pdfCache = new Map<string, Uint8Array>();

type DefenseSearch = { projectId?: string };

export const Route = createFileRoute("/defense")({
  ssr: false,
  beforeLoad: () => {
    requireAuth();
  },
  validateSearch: (search: Record<string, unknown>): DefenseSearch => {
    const raw = search.projectId;
    const projectId = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
    return { projectId };
  },
  component: DefensePage,
});

function DefensePage() {
  const { projectId } = Route.useSearch();
  const navigate = useNavigate();
  const { locale } = useLocale();
  const t = useMemo(() => defenseCopy(locale), [locale]);

  const [latexContent, setLatexContent] = useState("");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [mainFile, setMainFile] = useState("main.tex");
  const [compiler, setCompiler] = useState<LatexCompiler>("auto");
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [paperName, setPaperName] = useState("Untitled");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paperLoading, setPaperLoading] = useState(true);
  const [paperRefreshing, setPaperRefreshing] = useState(false);
  const [mobileTab, setMobileTab] = useState<DefenseMobileTab>("chat");

  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileWarning, setCompileWarning] = useState<string | null>(null);
  const [compileLog, setCompileLog] = useState<string | null>(null);

  // Session history: merged from server metadata + sessionStorage
  const [restoredSession, setRestoredSession] = useState<StoredDefenseSession | null>(null);

  const [messages, setMessages] = useState<DefenseMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activityText, setActivityText] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [quota, setQuota] = useState<DefenseQuota | null>(null);
  const [quotaLoadFailed, setQuotaLoadFailed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const streamGenRef = useRef(0);
  const compileInFlightRef = useRef(false);
  const pendingCompileForceRef = useRef(false);
  const lastPaperUpdatedAtRef = useRef<number | null>(null);
  const hasStartedRef = useRef(false);
  const messagesRef = useRef<DefenseMessage[]>([]);
  const isStreamingRef = useRef(false);
  const defenseLatexContextRef = useRef("");
  const visibilityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track previous projectId to reset conversation on navigation between papers
  const prevProjectIdRef = useRef(projectId);
  const pdfCitationKeyRef = useRef(0);
  const [pdfCitationFocus, setPdfCitationFocus] = useState<DefensePdfCitationFocus | null>(null);

  hasStartedRef.current = hasStarted;
  messagesRef.current = messages;
  isStreamingRef.current = isStreaming;

  const persistOpts = useMemo(
    () => ({
      onError: () => toast.error(t.chat.sessionPersistFailed),
    }),
    [t.chat.sessionPersistFailed],
  );

  const pdfStatus = useMemo((): DefensePdfStatus => {
    if (isCompiling) return "compiling";
    if (compileError) return "error";
    if (pdfData) return "ready";
    return "waiting";
  }, [isCompiling, compileError, pdfData]);

  const defenseLatexContext = useMemo(
    () => buildDefenseLatexContext({ latex: latexContent, files: projectFiles, mainFile }),
    [latexContent, projectFiles, mainFile],
  );
  defenseLatexContextRef.current = defenseLatexContext;

  const compileProject = useMemo(
    () =>
      projectId
        ? getCompilePayload({
            id: projectId,
            name: paperName,
            latex: latexContent,
            files: projectFiles,
            mainFile,
            compiler,
            assets,
            createdAt: 0,
            updatedAt: 0,
          })
        : null,
    [projectId, paperName, latexContent, projectFiles, mainFile, compiler, assets],
  );

  const handlePdfCitation = useCallback(
    (citation: DefensePdfCitation) => {
      const resolved = resolveDefensePdfCitation(citation, defenseLatexContext);
      const candidates = [resolved.locateText, ...resolved.headingCandidates].filter(
        (q, i, arr) => q.trim().length > 0 && arr.indexOf(q) === i,
      );
      if (!candidates.length) {
        toast.message(t.chat.citationNotFound);
        return;
      }
      const [search, ...searchCandidates] = candidates;
      pdfCitationKeyRef.current += 1;
      setPdfCitationFocus({
        search,
        page: resolved.page ?? citation.page,
        searchCandidates: searchCandidates.length > 0 ? searchCandidates : undefined,
        key: pdfCitationKeyRef.current,
      });
    },
    [defenseLatexContext, t.chat.citationNotFound],
  );

  const refreshQuota = useCallback(() => {
    setQuotaLoadFailed(false);
    fetchDefenseQuota()
      .then((q) => {
        setQuota(q);
        setQuotaLoadFailed(false);
      })
      .catch(() => {
        fetchBillingStatus()
          .then((billing) => {
            setQuota({
              plan: billing.tier,
              limit: billing.defense_turns_limit,
              used: billing.defense_turns_used,
              remaining: billing.defense_turns_remaining,
              period: "day",
              period_type: "daily",
              resets_at: null,
            });
            setQuotaLoadFailed(false);
          })
          .catch(() => {
            setQuotaLoadFailed(true);
          });
      });
  }, []);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  // Reset all conversation + compile state when navigating between papers
  useEffect(() => {
    if (prevProjectIdRef.current === projectId) return;
    prevProjectIdRef.current = projectId;
    abortRef.current?.abort();
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    streamGenRef.current += 1;
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    setHasStarted(false);
    setActivityText("");
    setPdfCitationFocus(null);
    setPdfData(null);
    setCompileError(null);
    setProjectFiles([]);
    setMainFile("main.tex");
    setCompiler("auto");
    setAssets([]);
    setQuota(null);
    setQuotaLoadFailed(false);
    setRestoredSession(null);
    lastPaperUpdatedAtRef.current = null;
  }, [projectId]);

  const applyPaper = useCallback(
    (paper: StoredProject) => {
      const normalizedMain = paper.mainFile ?? "main.tex";
      const prevUpdatedAt = lastPaperUpdatedAtRef.current;
      const contentChanged = prevUpdatedAt !== null && paper.updatedAt > prevUpdatedAt;
      lastPaperUpdatedAtRef.current = paper.updatedAt;

      setLatexContent(paper.latex);
      setProjectFiles(
        paper.files?.length ? paper.files : [{ path: normalizedMain, content: paper.latex }],
      );
      setMainFile(normalizedMain);
      setCompiler(paper.compiler ?? "auto");
      setAssets(paper.assets ?? []);
      setPaperName(paper.name);
      setLoadError(null);

      if (contentChanged) {
        setPdfData(null);
        setCompileError(null);
      }

      const merged = mergeDefenseSessions(
        paper.defenseSession,
        projectId ? loadLocalDefenseSession(projectId) : null,
      );
      if (!hasStartedRef.current && messagesRef.current.length === 0) {
        setRestoredSession(merged);
      }
    },
    [projectId],
  );

  const reloadPaper = useCallback(
    (opts?: { silent?: boolean; manual?: boolean }) => {
      if (!projectId || paperRefreshing) return;
      invalidateFetchKey(`papers:${projectId}`);
      const isBackground = Boolean(opts?.silent || opts?.manual);
      if (!isBackground) setPaperLoading(true);
      else setPaperRefreshing(true);

      const prevUpdatedAt = lastPaperUpdatedAtRef.current;
      fetchPaper(projectId)
        .then((paper) => {
          const wasUpdated = prevUpdatedAt !== null && paper.updatedAt > prevUpdatedAt;
          applyPaper(paper);
          if (opts?.manual) {
            toast.info(wasUpdated ? t.chat.paperUpdatedFromEditor : t.chat.paperRefreshDone);
          } else if (opts?.silent && wasUpdated) {
            toast.info(t.chat.paperUpdatedFromEditor);
          }
        })
        .catch((err: unknown) => {
          if (!isBackground) {
            setLoadError(err instanceof Error ? err.message : t.chat.paperLoadFallbackError);
          } else {
            toast.error(err instanceof Error ? err.message : t.chat.paperLoadFallbackError);
          }
        })
        .finally(() => {
          if (!isBackground) setPaperLoading(false);
          else setPaperRefreshing(false);
        });
    },
    [projectId, paperRefreshing, applyPaper, t.chat],
  );

  const handleRefreshPaper = useCallback(() => {
    reloadPaper({ silent: true, manual: true });
  }, [reloadPaper]);

  useEffect(() => {
    if (!projectId) void navigate({ to: "/projects" });
  }, [projectId, navigate]);

  useEffect(() => {
    if (!projectId) return;
    setPaperLoading(true);
    lastPaperUpdatedAtRef.current = null;
    fetchPaper(projectId)
      .then((paper) => applyPaper(paper))
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : t.chat.paperLoadFallbackError);
      })
      .finally(() => setPaperLoading(false));
  }, [projectId, applyPaper, t.chat.paperLoadFallbackError]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (isStreamingRef.current) return;
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
      visibilityDebounceRef.current = setTimeout(() => {
        reloadPaper({ silent: true });
      }, 800);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (visibilityDebounceRef.current) clearTimeout(visibilityDebounceRef.current);
    };
  }, [reloadPaper]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      flushDefenseSessionPersistNow();
    };
  }, []);

  // PDF compile with fingerprint cache — skips recompile when project unchanged in-tab.
  const runCompile = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!compileProject || !projectId) return;

      if (compileInFlightRef.current) {
        if (force) pendingCompileForceRef.current = true;
        return;
      }

      const assetHashes = await buildCompileAssetHashes(compileProject.assets);
      const fingerprint = computeCompileFingerprint(compileProject, assetHashes);
      const cached = _pdfCache.get(fingerprint);
      if (!force && cached) {
        setPdfData(cached);
        setCompileError(null);
        return;
      }

      compileInFlightRef.current = true;
      setIsCompiling(true);
      setCompileError(null);
      try {
        const result: CompileResult = await compileLatex(
          compileProject.latex,
          compileProject.assets,
          {
            mainFile: compileProject.mainFile,
            compiler: compileProject.compiler,
            cacheId: projectId,
            mode: "full",
            knownAssetHashes: assetHashes,
            forceFullAssets: force,
          },
        );
        if (result.success && result.pdf_base64) {
          const binary = atob(result.pdf_base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          _pdfCache.set(fingerprint, bytes);
          setPdfData(bytes);
          setCompileError(null);
          setCompileWarning(result.warning ?? null);
          setCompileLog(null);
        } else {
          setCompileError(result.error || t.chat.compileFailed);
          setCompileLog(result.log ?? null);
        }
      } catch {
        setCompileError(t.chat.compileNetworkError);
      } finally {
        compileInFlightRef.current = false;
        setIsCompiling(false);
        if (pendingCompileForceRef.current) {
          pendingCompileForceRef.current = false;
          void runCompile({ force: true });
        }
      }
    },
    [compileProject, projectId, t.chat.compileFailed, t.chat.compileNetworkError],
  );

  const handleRetryCompile = useCallback(() => {
    void runCompile({ force: true });
  }, [runCompile]);

  const handleCitationMiss = useCallback(() => {
    toast.message(t.chat.citationNotFound);
  }, [t.chat.citationNotFound]);

  useEffect(() => {
    if (compileProject?.latex) void runCompile();
  }, [compileProject, runCompile]);

  const handleSend = useCallback(() => {
    if (isStreaming) return;

    // Block send when quota couldn't be loaded (initial load only)
    if (DEFENSE_QUOTA_ENABLED && quotaLoadFailed && quota === null) {
      toast.warning(t.chat.quotaLoadError);
      return;
    }

    const completedCouncilTurns = countCompletedCouncilTurns(messages);
    if (
      DEFENSE_QUOTA_ENABLED &&
      quota &&
      (quota.remaining <= 0 || completedCouncilTurns >= quota.limit)
    ) {
      const msg =
        quota.plan === "free"
          ? `${t.chat.quotaExceededDaily} ${t.chat.quotaWaitTomorrow}`
          : `${t.chat.quotaExceededPro} ${t.chat.quotaWaitReset}`;
      toast.error(msg);
      return;
    }

    // When starting a fresh session (user chose "Bắt đầu mới"), clear any
    // previously saved session so the welcome screen won't show stale history.
    if (!hasStarted && messages.length === 0 && projectId) {
      clearDefenseSession(projectId, persistOpts);
      setRestoredSession(null);
    }

    const userMessage = input.trim();
    const history: DefenseConversationTurn[] = buildDefenseConversationHistory(messages);

    if (userMessage) {
      history.push({ role: "user", content: userMessage });
      setMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage },
        { role: "assistant", content: "", isStreaming: true },
      ]);
      setInput("");
    } else {
      setMessages([{ role: "assistant", content: "", isStreaming: true }]);
    }

    setIsStreaming(true);
    setHasStarted(true);
    const thinkingText =
      history.some((h) => h.role === "user") || userMessage
        ? t.chat.thinkingFollowUp
        : t.chat.thinkingDefault;
    setActivityText(thinkingText);

    const abort = new AbortController();
    abortRef.current = abort;
    streamGenRef.current += 1;
    const myGen = streamGenRef.current;
    rafIdRef.current = null;
    let assembled = "";

    const flushStreamContent = () => {
      rafIdRef.current = null;
      const snapshot = assembled;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: snapshot, isStreaming: true };
        }
        return next;
      });
    };

    const scheduleStreamFlush = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(flushStreamContent);
    };

    streamDefense(
      {
        latex_content: defenseLatexContext,
        conversation_history: history,
        mode: "proactive",
        paper_id: projectId,
        locale,
        user_name: getSession()?.name,
      },
      {
        onActivity: () => setActivityText(thinkingText),
        onToken: (delta) => {
          if (streamGenRef.current !== myGen) return;
          assembled += delta;
          if (delta) setActivityText("");
          scheduleStreamFlush();
        },
        onDone: (response) => {
          if (streamGenRef.current !== myGen) return;
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          const latexCtx = defenseLatexContextRef.current;
          const finalText = prepareDefenseCouncilMarkdown(response || assembled, latexCtx);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: finalText, isStreaming: false };
            }
            if (projectId) {
              persistDefenseSession(projectId, { messages: next, hasStarted: true }, persistOpts);
            }
            return next;
          });
          setActivityText("");
          setIsStreaming(false);
          // Only optimistically decrement when response is non-empty (matches backend logic)
          if ((response || assembled).trim()) {
            setQuota((q) =>
              q
                ? {
                    ...q,
                    used: Math.min(q.limit, q.used + 1),
                    remaining: Math.max(0, q.remaining - 1),
                  }
                : q,
            );
          }
          refreshQuota();
        },
        onError: (message) => {
          if (streamGenRef.current !== myGen) return;
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          const text = isDefenseQuotaError(message)
            ? formatDefenseQuotaError(message, t.chat)
            : message;
          setMessages((prev) => {
            const next = [...prev];
            if (next[next.length - 1]?.isStreaming) next.pop();
            next.push({ role: "assistant", content: text, isError: true });
            return next;
          });
          setActivityText("");
          setIsStreaming(false);
          refreshQuota();
        },
      },
      abort.signal,
    );
  }, [
    isStreaming,
    quotaLoadFailed,
    hasStarted,
    input,
    messages,
    defenseLatexContext,
    projectId,
    quota,
    locale,
    t.chat,
    refreshQuota,
    persistOpts,
  ]);

  const completedCouncilTurns = countCompletedCouncilTurns(messages);
  const displayUsed = quota ? Math.max(quota.used, completedCouncilTurns) : completedCouncilTurns;

  const handleStop = useCallback(() => {
    streamGenRef.current += 1; // invalidate any in-flight callbacks before aborting
    abortRef.current?.abort();
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setIsStreaming(false);
    setActivityText("");
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.isStreaming) {
        // Keep partial content but mark as cancelled; remove if empty
        if (last.content.trim()) {
          next[next.length - 1] = { ...last, isStreaming: false, isCancelled: true };
        } else {
          next.pop();
        }
      }
      if (projectId) {
        persistDefenseSession(projectId, { messages: next, hasStarted: true }, persistOpts);
      }
      return next;
    });
    refreshQuota();
  }, [projectId, refreshQuota, persistOpts]);

  const doReset = useCallback(() => {
    streamGenRef.current += 1;
    abortRef.current?.abort();
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setIsStreaming(false);
    setMessages([]);
    setInput("");
    setHasStarted(false);
    setActivityText("");
    setPdfCitationFocus(null);
    setRestoredSession(null);
    if (projectId) clearDefenseSession(projectId, persistOpts);
  }, [projectId, persistOpts]);

  const handleResume = useCallback(() => {
    if (!restoredSession) return;
    setMessages(restoredSession.messages.filter((m) => !m.isStreaming));
    setHasStarted(true);
  }, [restoredSession]);

  const handleReset = useCallback(() => {
    if (messages.length === 0) {
      doReset();
      return;
    }
    toast(t.chat.resetConfirmTitle, {
      description: t.chat.resetConfirmDesc,
      action: { label: t.chat.resetConfirmYes, onClick: doReset },
      cancel: { label: t.chat.resetConfirmNo, onClick: () => {} },
      duration: 8000,
    });
  }, [messages.length, t.chat, doReset]);

  const chatPanel = (
    <DefenseChatPanel
      copy={t.chat}
      quota={quota}
      quotaLoadFailed={quotaLoadFailed}
      messages={messages}
      input={input}
      isStreaming={isStreaming}
      activityText={activityText}
      onInputChange={setInput}
      onSend={handleSend}
      onStop={handleStop}
      onReset={handleReset}
      onResume={restoredSession ? handleResume : undefined}
      savedMessages={restoredSession?.messages.filter((m) => !m.isStreaming)}
      onQuotaRetry={refreshQuota}
      hasStarted={hasStarted}
      paperName={paperName}
      latexContent={defenseLatexContext}
      onPdfCitation={(citation) => {
        handlePdfCitation(citation);
        setMobileTab("pdf");
      }}
      locale={locale}
      onQuotaRefresh={refreshQuota}
    />
  );

  const pdfPanel = (
    <PdfPreviewPanel
      pdfData={pdfData}
      isCompiling={isCompiling}
      compileError={compileError}
      compileWarning={compileWarning}
      compileLog={compileLog}
      mainFile={mainFile}
      projectName={paperName}
      onCompile={handleRetryCompile}
      readOnly
      latexSource={defenseLatexContext}
      citationFocus={pdfCitationFocus}
      onCitationMiss={handleCitationMiss}
    />
  );

  if (paperLoading) {
    return <AppLoadingScreen label={t.loading} variant="fullscreen" />;
  }

  if (loadError) {
    return (
      <div className="editor-shell flex h-[100dvh] flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm font-medium">{loadError}</p>
        <Link to="/projects" className="text-xs text-primary underline underline-offset-4">
          {t.loadErrorBack}
        </Link>
      </div>
    );
  }

  return (
    <div className="editor-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="editor-masthead flex shrink-0 items-center justify-between gap-3 border-b px-4 py-1.5 text-[10px] font-mono-data uppercase tracking-widest">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/editor"
            search={{ projectId: projectId! }}
            className="flex shrink-0 items-center gap-1.5 hover:text-[color:var(--editorial-red)] transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            {t.masthead.backToProject}
          </Link>
          <span className="opacity-40">·</span>
          <span className="truncate normal-case font-sans text-[11px] font-medium opacity-80">
            {paperName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefreshPaper}
            disabled={paperRefreshing || isStreaming}
            className="defense-masthead-refresh inline-flex items-center gap-1 rounded px-1.5 py-0.5 normal-case font-sans text-[10px] tracking-normal transition hover:text-[color:var(--editorial-red)] disabled:opacity-50"
            title={t.masthead.refreshPaper}
          >
            <RefreshCw className={`h-3 w-3${paperRefreshing ? " animate-spin" : ""}`} aria-hidden />
            {paperRefreshing ? t.masthead.refreshingPaper : t.masthead.refreshPaper}
          </button>
          {quota ? (
            <DefenseQuotaBadge
              copy={t.chat}
              quota={quota}
              displayUsed={displayUsed}
              showPeriod
              className="defense-masthead-quota"
            />
          ) : null}
          <DefenseMastheadPrefs />
        </div>
      </div>

      <DefensePdfStatusBar
        status={pdfStatus}
        copy={t.pdfStatus}
        onRetry={handleRetryCompile}
        isRetrying={isCompiling}
      />

      <DefenseMobileTabBar tab={mobileTab} onChange={setMobileTab} copy={t.mobile} />

      <div className="hidden min-h-0 flex-1 overflow-hidden md:flex">
        <EditorDesktopPanels
          groupId="defense-layout-70"
          centerPanelId="defense-chat"
          previewPanelId="defense-preview"
          centerDefaultSize={70}
          previewDefaultSize={30}
          centerMinSize={28}
          previewMinSize={22}
          center={chatPanel}
          right={pdfPanel}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
        {mobileTab === "chat" ? chatPanel : pdfPanel}
      </div>
    </div>
  );
}
