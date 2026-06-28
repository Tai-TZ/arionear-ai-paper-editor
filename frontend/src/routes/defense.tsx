import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// ─── Module-level PDF cache (survives SPA navigation within the same tab) ──
// Keyed by projectId + content fingerprint so stale PDFs are never served
// after a LaTeX edit.
const _pdfCache = new Map<string, Uint8Array>();
function pdfCacheKey(projectId: string, content: string): string {
  return `${projectId}:${content.length}:${content.slice(-200)}`;
}
import { fetchPaper } from "@/lib/api/papers-api";
import { compileLatex, type CompileResult } from "@/lib/api/academic";
import { getSession } from "@/lib/auth-store";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { EditorDesktopPanels } from "@/components/editor-desktop-panels";
import { PdfPreviewPanel } from "@/components/pdf-preview-panel";
import { useLocale } from "@/components/locale-provider";
import { DefenseMastheadPrefs } from "@/components/defense/defense-masthead-prefs";
import {
  DefenseChatPanel,
  DefenseQuotaBadge,
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
import { prepareDefenseCouncilMarkdown } from "@/lib/defense-pdf-autolink";

type DefenseSearch = { projectId?: string };

// ─── Session history helpers ─────────────────────────────────────────────────
type SavedDefenseSession = {
  messages: DefenseMessage[];
  hasStarted: boolean;
};

function loadSession(projectId: string): SavedDefenseSession | null {
  try {
    const raw = sessionStorage.getItem(`defense_session_${projectId}`);
    if (!raw) return null;
    return JSON.parse(raw) as SavedDefenseSession;
  } catch {
    return null;
  }
}

function saveSession(projectId: string, session: SavedDefenseSession) {
  try {
    // Strip in-flight streaming/cancelled-empty messages before saving
    const clean = session.messages.filter((m) => !m.isStreaming);
    sessionStorage.setItem(
      `defense_session_${projectId}`,
      JSON.stringify({ ...session, messages: clean }),
    );
  } catch {
    /* sessionStorage full — ignore */
  }
}

function clearSession(projectId: string) {
  sessionStorage.removeItem(`defense_session_${projectId}`);
}

export const Route = createFileRoute("/defense")({
  ssr: false,
  beforeLoad: () => {
    requireAuth();
  },
  validateSearch: (search: Record<string, unknown>): DefenseSearch => {
    const raw = search.projectId;
    const projectId =
      typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
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
  const [paperName, setPaperName] = useState("Untitled");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paperLoading, setPaperLoading] = useState(true);

  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileWarning, setCompileWarning] = useState<string | null>(null);
  const [compileLog, setCompileLog] = useState<string | null>(null);

  // Session history: loaded once at mount; reset when projectId changes
  const [restoredSession, setRestoredSession] = useState<SavedDefenseSession | null>(
    () => (projectId ? loadSession(projectId) : null),
  );

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
  // Track previous projectId to reset conversation on navigation between papers
  const prevProjectIdRef = useRef(projectId);
  const pdfCitationKeyRef = useRef(0);
  const [pdfCitationFocus, setPdfCitationFocus] = useState<DefensePdfCitationFocus | null>(null);

  const handlePdfCitation = useCallback((citation: DefensePdfCitation) => {
    pdfCitationKeyRef.current += 1;
    setPdfCitationFocus({ ...citation, key: pdfCitationKeyRef.current });
  }, []);

  const refreshQuota = useCallback(() => {
    setQuotaLoadFailed(false);
    fetchDefenseQuota()
      .then((q) => { setQuota(q); setQuotaLoadFailed(false); })
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
    setQuota(null);
    setQuotaLoadFailed(false);
    setRestoredSession(projectId ? loadSession(projectId) : null);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) void navigate({ to: "/projects" });
  }, [projectId, navigate]);

  useEffect(() => {
    if (!projectId) return;
    setPaperLoading(true);
    fetchPaper(projectId)
      .then((paper) => {
        setLatexContent(paper.latex);
        setPaperName(paper.name);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : t.chat.paperLoadFallbackError);
      })
      .finally(() => setPaperLoading(false));
  }, [projectId]);

  // PDF compile with content-aware module-level cache — skips recompile when
  // latex hasn't changed since last compile within this browser tab session.
  const runCompile = useCallback((latex: string) => {
    if (!latex || !projectId) return;
    const key = pdfCacheKey(projectId, latex);
    const cached = _pdfCache.get(key);
    if (cached) {
      setPdfData(cached);
      return;
    }
    setIsCompiling(true);
    setCompileError(null);
    compileLatex(latex, [], { compiler: "auto" })
      .then((result: CompileResult) => {
        if (result.success && result.pdf_base64) {
          const binary = atob(result.pdf_base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          _pdfCache.set(key, bytes);
          setPdfData(bytes);
          setCompileError(null);
          setCompileWarning(result.warning ?? null);
        } else {
          setCompileError(result.error || t.chat.compileFailed);
          setCompileLog(result.log ?? null);
        }
      })
      .catch(() => setCompileError(t.chat.compileNetworkError))
      .finally(() => setIsCompiling(false));
  }, [projectId, t.chat.compileFailed, t.chat.compileNetworkError]);

  useEffect(() => {
    if (latexContent) runCompile(latexContent);
  }, [latexContent, runCompile]);

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
      clearSession(projectId);
      setRestoredSession(null);
    }

    const userMessage = input.trim();
    // Build history excluding cancelled partial messages (no content)
    const history: DefenseConversationTurn[] = messages
      .filter((m) => !(m.isCancelled && !m.content.trim()))
      .map((m) => ({ role: m.role, content: m.content }));

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
        latex_content: latexContent,
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
          if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
          const finalText = prepareDefenseCouncilMarkdown(response || assembled, latexContent);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: finalText, isStreaming: false };
            }
            if (projectId) saveSession(projectId, { messages: next, hasStarted: true });
            return next;
          });
          setActivityText("");
          setIsStreaming(false);
          // Only optimistically decrement when response is non-empty (matches backend logic)
          if ((response || assembled).trim()) {
            setQuota((q) =>
              q ? { ...q, used: Math.min(q.limit, q.used + 1), remaining: Math.max(0, q.remaining - 1) } : q,
            );
          }
          refreshQuota();
        },
        onError: (message) => {
          if (streamGenRef.current !== myGen) return;
          if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
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
  }, [isStreaming, quotaLoadFailed, hasStarted, input, messages, latexContent, projectId, quota, locale, t.chat, refreshQuota]);

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
      if (projectId) saveSession(projectId, { messages: next, hasStarted: true });
      return next;
    });
    refreshQuota();
  }, [projectId, refreshQuota]);

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
    if (projectId) clearSession(projectId);
  }, [projectId]);

  const handleResume = useCallback(() => {
    if (!restoredSession) return;
    setMessages(restoredSession.messages.filter((m) => !m.isStreaming));
    setHasStarted(true);
  }, [restoredSession]);

  const handleReset = useCallback(() => {
    if (messages.length === 0) { doReset(); return; }
    toast(t.chat.resetConfirmTitle, {
      description: t.chat.resetConfirmDesc,
      action: { label: t.chat.resetConfirmYes, onClick: doReset },
      cancel: { label: t.chat.resetConfirmNo, onClick: () => {} },
      duration: 8000,
    });
  }, [messages.length, t.chat, doReset]);

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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <EditorDesktopPanels
          groupId="defense-layout-70"
          centerPanelId="defense-chat"
          previewPanelId="defense-preview"
          centerDefaultSize={70}
          previewDefaultSize={30}
          centerMinSize={28}
          previewMinSize={22}
          center={
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
              latexContent={latexContent}
              onPdfCitation={handlePdfCitation}
              locale={locale}
              onQuotaRefresh={refreshQuota}
            />
          }
          right={
            <PdfPreviewPanel
              pdfData={pdfData}
              isCompiling={isCompiling}
              compileError={compileError}
              compileWarning={compileWarning}
              compileLog={compileLog}
              mainFile="main.tex"
              projectName={paperName}
              onCompile={() => {}}
              readOnly
              latexSource={latexContent}
              citationFocus={pdfCitationFocus}
            />
          }
        />
      </div>
    </div>
  );
}
