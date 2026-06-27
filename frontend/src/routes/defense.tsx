import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { fetchPaper } from "@/lib/api/papers-api";
import { compileLatex, type CompileResult } from "@/lib/api/academic";
import { AppLoadingScreen } from "@/components/app-loading-screen";
import { EditorDesktopPanels } from "@/components/editor-desktop-panels";
import { PdfPreviewPanel } from "@/components/pdf-preview-panel";
import { useLocale } from "@/components/locale-provider";
import { DefenseMastheadPrefs } from "@/components/defense/defense-masthead-prefs";
import {
  DefenseChatPanel,
  countCompletedCouncilTurns,
  type DefenseMessage,
} from "@/components/defense/defense-chat-panel";
import { defenseCopy, formatDefenseQuotaError, isDefenseQuotaError } from "@/lib/defense-i18n";
import {
  fetchDefenseQuota,
  streamDefense,
  DEFENSE_QUOTA_ENABLED,
  type DefenseConversationTurn,
  type DefenseMode,
  type DefenseQuota,
} from "@/lib/api/defense-api";
import type { DefensePdfCitation, DefensePdfCitationFocus } from "@/lib/defense-pdf-links";
import { prepareDefenseCouncilMarkdown } from "@/lib/defense-pdf-autolink";

type DefenseSearch = { projectId?: string };

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

  const [messages, setMessages] = useState<DefenseMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<DefenseMode>("proactive");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activityText, setActivityText] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [quota, setQuota] = useState<DefenseQuota | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pdfCitationKeyRef = useRef(0);
  const [pdfCitationFocus, setPdfCitationFocus] = useState<DefensePdfCitationFocus | null>(null);

  const handlePdfCitation = useCallback((citation: DefensePdfCitation) => {
    pdfCitationKeyRef.current += 1;
    setPdfCitationFocus({ ...citation, key: pdfCitationKeyRef.current });
  }, []);

  const refreshQuota = useCallback(() => {
    fetchDefenseQuota()
      .then(setQuota)
      .catch(() => {
        /* quota display is optional if fetch fails */
      });
  }, []);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

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
        setLoadError(err instanceof Error ? err.message : "Failed to load paper.");
      })
      .finally(() => setPaperLoading(false));
  }, [projectId]);

  const runCompile = useCallback((latex: string) => {
    if (!latex) return;
    setIsCompiling(true);
    setCompileError(null);
    compileLatex(latex, [], { compiler: "auto" })
      .then((result: CompileResult) => {
        if (result.success && result.pdf_base64) {
          const binary = atob(result.pdf_base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          setPdfData(bytes);
          setCompileError(null);
          setCompileWarning(result.warning ?? null);
        } else {
          setCompileError(result.error || "Compile failed.");
          setCompileLog(result.log ?? null);
        }
      })
      .catch(() => setCompileError("Could not compile PDF."))
      .finally(() => setIsCompiling(false));
  }, []);

  useEffect(() => {
    if (latexContent) runCompile(latexContent);
  }, [latexContent, runCompile]);

  const handleSend = useCallback(() => {
    if (isStreaming) return;

    const completedCouncilTurns = countCompletedCouncilTurns(messages);
    if (DEFENSE_QUOTA_ENABLED && quota && completedCouncilTurns >= quota.limit) {
      const msg =
        quota.period_type === "monthly"
          ? `${t.chat.quotaExceededMonthly} ${t.chat.upgradeHint}`
          : `${t.chat.quotaExceededDaily} ${t.chat.quotaWaitTomorrow}`;
      toast.error(msg);
      return;
    }

    const userMessage = input.trim();
    const history: DefenseConversationTurn[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

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
    setActivityText("");

    const abort = new AbortController();
    abortRef.current = abort;
    let assembled = "";
    let rafId: number | null = null;

    const flushStreamContent = () => {
      rafId = null;
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
      if (rafId !== null) return;
      rafId = requestAnimationFrame(flushStreamContent);
    };

    streamDefense(
      { latex_content: latexContent, conversation_history: history, mode, paper_id: projectId },
      {
        onActivity: (text) => setActivityText(text),
        onToken: (delta) => {
          assembled += delta;
          if (delta) setActivityText("");
          scheduleStreamFlush();
        },
        onDone: (response) => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          const finalText = prepareDefenseCouncilMarkdown(response || assembled, latexContent);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: finalText, isStreaming: false };
            }
            return next;
          });
          setActivityText("");
          setIsStreaming(false);
          setQuota((q) =>
            q
              ? {
                  ...q,
                  used: Math.min(q.limit, q.used + 1),
                  remaining: Math.max(0, q.remaining - 1),
                }
              : q,
          );
          refreshQuota();
        },
        onError: (message) => {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          const text = isDefenseQuotaError(message)
            ? formatDefenseQuotaError(message, t.chat)
            : message;
          toast.error(text);
          setMessages((prev) => {
            const next = [...prev];
            if (next[next.length - 1]?.isStreaming) next.pop();
            return next;
          });
          setActivityText("");
          setIsStreaming(false);
          refreshQuota();
        },
      },
      abort.signal,
    );
  }, [isStreaming, input, messages, latexContent, mode, projectId, quota, t.chat, refreshQuota]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setActivityText("");
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.isStreaming) next[next.length - 1] = { ...last, isStreaming: false };
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    handleStop();
    setMessages([]);
    setInput("");
    setHasStarted(false);
    setActivityText("");
    setPdfCitationFocus(null);
  }, [handleStop]);

  const handleModeChange = useCallback(
    (newMode: DefenseMode) => {
      if (hasStarted) return;
      setMode(newMode);
    },
    [hasStarted],
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
          <DefenseMastheadPrefs />
          <span className="hidden sm:inline opacity-40">·</span>
          <span className="hidden sm:inline text-[color:var(--editorial-red,hsl(0,72%,51%))]">
            {t.masthead.modeLabel}
          </span>
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
              messages={messages}
              input={input}
              mode={mode}
              isStreaming={isStreaming}
              activityText={activityText}
              onInputChange={setInput}
              onSend={handleSend}
              onStop={handleStop}
              onModeChange={handleModeChange}
              onReset={handleReset}
              hasStarted={hasStarted}
              paperName={paperName}
              latexContent={latexContent}
              onPdfCitation={handlePdfCitation}
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
