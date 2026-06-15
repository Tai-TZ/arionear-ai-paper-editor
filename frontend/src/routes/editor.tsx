import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Search,
  ChevronLeft,
  ShieldCheck,
  ArrowLeft,
  Plus,
  Upload,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FolderOpen,
  Settings,
  X,
  HelpCircle,
  Undo2,
  Redo2,
  Wrench,
} from "lucide-react";
import { getSession } from "@/lib/auth-store";
import {
  addProjectAssets,
  getProject,
  isImageAssetFile,
  isProjectAssetFile,
  readFileAsDataUrl,
  updateProject,
  type ProjectAsset,
} from "@/lib/project-store";
import {
  compileLatex,
  fetchProviders,
  streamChat,
  syncSession,
  verifyCitations,
  type LLMProvider,
  type ProviderInfo,
} from "@/lib/api/academic";
import { PdfPreviewPanel } from "@/components/pdf-preview-panel";
import { citationErrorMessage } from "@/lib/api/api-errors";
import {
  arioAvatar,
  ChatOverlay,
  ChatMessages,
  ChatInput,
  type ChatMessage,
} from "@/components/chat-overlay";
import { SuggestionPanel } from "@/components/suggestion-panel";
import { LatexDiffEditor } from "@/components/latex-diff-editor";
import { LatexCodeEditor } from "@/components/latex-code-editor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import {
  EditorEntrySplash,
} from "@/components/editor-entry-splash";
import { EditorDesktopPanels } from "@/components/editor-desktop-panels";
import { useLatexHistory } from "@/lib/use-latex-history";

type EditorSearch = {
  projectId?: string;
};

export const Route = createFileRoute("/editor")({
  validateSearch: (search: Record<string, unknown>): EditorSearch => ({
    projectId: typeof search.projectId === "string" ? search.projectId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Editor — Arionear" },
      {
        name: "description",
        content: "Upload LaTeX manuscripts and refine them with an AI academic writing assistant.",
      },
    ],
  }),
  component: EditorPage,
});

const today = new Date().toLocaleDateString("en-US", {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
});

type MobileTab = "files" | "editor" | "preview";

type PendingSuggestion = {
  originalText: string;
  suggestion: string;
  diff: string;
  flags: { code: string; message: string; severity: string }[];
  revisionId?: string;
  applyMode?: "selection" | "document";
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Xin chào, tôi là Ario — trợ lý biên tập học thuật của bạn. Tôi có thể giúp cải thiện văn phong, cấu trúc bài báo, hoặc định dạng trích dẫn trong bản thảo. Bạn muốn bắt đầu từ phần nào?",
  },
];

const PROJECT_FILES = [
  { name: "main.tex", active: true },
  { name: "references.bib", active: false },
  { name: "figures/fig1.pdf", active: false },
];

const OUTLINE_SECTIONS = ["Abstract", "Introduction", "Methods", "Results", "Conclusion"];

type ToolsTab = "info" | "versions" | "citations";

type ProjectStats = {
  words: number;
  wordsInText: number;
  wordsInHeaders: number;
  wordsOutsideText: number;
  headers: number;
  figures: number;
  mathInlines: number;
  mathDisplayed: number;
};

type VersionEntry = {
  version: string;
  timeAgo: string;
  additions: number;
  deletions: number;
  author: string;
  badge?: string;
};

type VersionGroup = {
  title: string;
  revisionCount?: number;
  defaultOpen?: boolean;
  entries: VersionEntry[];
};

const VERSION_HISTORY: { date: string; groups: VersionGroup[] }[] = [
  {
    date: "Jun 10, 2026",
    groups: [
      {
        title: "Edited main.tex",
        revisionCount: 2,
        defaultOpen: true,
        entries: [
          { version: "v3", timeAgo: "17 hours ago", additions: 1, deletions: 1, author: "You" },
          { version: "v2", timeAgo: "17 hours ago", additions: 1, deletions: 1, author: "You" },
        ],
      },
      {
        title: "Added main.tex",
        entries: [
          {
            version: "v1",
            timeAgo: "17 hours ago",
            additions: 25,
            deletions: 0,
            author: "You",
            badge: "Initial",
          },
        ],
      },
    ],
  },
];

function stripLatexCommands(source: string) {
  return source
    .replace(/%.*$/gm, "")
    .replace(/\\begin\{document\}[\s\S]*\\end\{document\}/, (block) => block)
    .replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^{}]*\})?/g, " ")
    .replace(/[{}\\$&%#_^~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string) {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function computeProjectStats(latex: string): ProjectStats {
  const preamble = latex.split("\\begin{document}")[0] ?? "";
  const body = latex.split("\\begin{document}")[1]?.split("\\end{document}")[0] ?? latex;

  const headerBlocks = [
    ...(body.match(/\\title\{([^}]*)\}/g) ?? []),
    ...(body.match(/\\author\{([^}]*)\}/g) ?? []),
    ...(body.match(/\\section\*?\{([^}]*)\}/g) ?? []),
    ...(body.match(/\\subsection\*?\{([^}]*)\}/g) ?? []),
  ]
    .map((m) => m.replace(/\\[a-zA-Z@]+\*?\{([^}]*)\}/, "$1"))
    .join(" ");

  const textBody = body
    .replace(/\\title\{[^}]*\}/g, "")
    .replace(/\\author\{[^}]*\}/g, "")
    .replace(/\\date\{[^}]*\}/g, "")
    .replace(/\\maketitle/g, "")
    .replace(/\\section\*?\{[^}]*\}/g, "")
    .replace(/\\subsection\*?\{[^}]*\}/g, "");

  const wordsInHeaders = countWords(stripLatexCommands(headerBlocks));
  const wordsInText = countWords(stripLatexCommands(textBody));
  const wordsOutsideText = countWords(stripLatexCommands(preamble));
  const words = wordsInText + wordsInHeaders + wordsOutsideText;

  return {
    words,
    wordsInText,
    wordsInHeaders,
    wordsOutsideText,
    headers:
      (body.match(/\\section\*?\{/g) ?? []).length +
      (body.match(/\\subsection\*?\{/g) ?? []).length +
      (latex.includes("\\title{") ? 1 : 0),
    figures: (latex.match(/\\includegraphics/g) ?? []).length,
    mathInlines: (latex.match(/(?<!\$)\$(?!\$)[^$]+\$(?!\$)/g) ?? []).length,
    mathDisplayed: (latex.match(/\\begin\{(equation|align|gather|multline)\*?\}/g) ?? []).length,
  };
}

function EditorPage() {
  const navigate = useNavigate();
  const { projectId } = Route.useSearch();
  const [sidebarTab, setSidebarTab] = useState<"files" | "chats">("files");
  const [mobileTab, setMobileTab] = useState<MobileTab>("editor");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [bootState, setBootState] = useState<"loading" | "ready">("loading");
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
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileWarning, setCompileWarning] = useState<string | null>(null);
  const [autoCompile, setAutoCompile] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [liveActivity, setLiveActivity] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState("");
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("openrouter");
  const [llmModel, setLlmModel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) {
      navigate({ to: "/projects", replace: true });
      return;
    }
    const project = getProject(projectId);
    if (!project) {
      navigate({ to: "/projects", replace: true });
      return;
    }
    setProjectName(project.name);
    resetHistory(project.latex);
    setSavedLatex(project.latex);
    setAssets(project.assets ?? []);
    setBootState("ready");
  }, [projectId, navigate, resetHistory]);

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

  const handleCompile = useCallback(async (latexOverride?: string) => {
    const source = latexOverride ?? latex;
    setIsCompiling(true);
    setCompileError(null);
    setCompileWarning(null);
    try {
      const result = await compileLatex(source, assets);
      if (result.success && result.pdf_base64) {
        const binary = atob(result.pdf_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        setPdfData(bytes);
        setCompileWarning(result.warning?.trim() || null);
      } else {
        const detail = [result.error, result.log?.slice(-1500)].filter(Boolean).join("\n\n");
        setCompileError(detail || "Compilation failed.");
      }
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "Compilation failed.");
    } finally {
      setIsCompiling(false);
    }
  }, [latex, assets]);

  const handleSave = useCallback(() => {
    if (!projectId) return;
    updateProject(projectId, { latex });
    setSavedLatex(latex);
    syncSession(projectId, projectName, latex).catch(() => {});
    if (autoCompile) {
      void handleCompile(latex);
    }
  }, [projectId, projectName, latex, autoCompile, handleCompile]);

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
    syncSession(projectId, projectName, latex).catch(() => {});
  }, [bootState, projectId, projectName, latex]);

  const loadProviders = useCallback(() => {
    fetchProviders()
      .then((data) => {
        setProviders(data.providers);
        setLlmProvider(data.default_provider);
        const defaultP = data.providers.find((p) => p.id === data.default_provider);
        if (defaultP) setLlmModel(defaultP.default_model);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (chatLoading) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const texFile = files.find((f) => /\.(tex|latex)$/i.test(f.name));
    const assetFiles = files.filter((f) => isProjectAssetFile(f.name));

    if (texFile) {
      const text = await texFile.text();
      recordNow(text);
    }

    if (assetFiles.length && projectId) {
      const uploaded = await Promise.all(assetFiles.map(readFileAsDataUrl));
      const updated = addProjectAssets(projectId, uploaded);
      if (updated?.assets) setAssets(updated.assets);
    }

    e.target.value = "";
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !projectId) return;

    const assetFiles = files.filter((f) => isProjectAssetFile(f.name));
    if (!assetFiles.length) return;

    const uploaded = await Promise.all(assetFiles.map(readFileAsDataUrl));
    const updated = addProjectAssets(projectId, uploaded);
    if (updated?.assets) setAssets(updated.assets);
    e.target.value = "";
  };

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading || !projectId) return;
    setChatOpen(true);
    chatAbortRef.current?.abort();
    const abort = new AbortController();
    chatAbortRef.current = abort;

    const assistantIdx = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      {
        role: "assistant",
        content: "",
        activities: [],
        reasoning: "",
        isStreaming: true,
      },
    ]);
    setChatInput("");
    setChatLoading(true);
    setLiveActivity(null);
    setPendingSuggestion(null);

    const patchAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        const msg = next[assistantIdx];
        if (msg?.role === "assistant") {
          next[assistantIdx] = updater(msg);
        }
        return next;
      });
    };

    try {
      await streamChat(
        text,
        {
          sessionId: projectId,
          latexContent: latex,
          selection,
          llm_provider: llmProvider,
          llm_model: llmModel || undefined,
        },
        {
          onActivity: (activityText) => {
            setLiveActivity(activityText);
            patchAssistant((msg) => {
              const activities = [...(msg.activities ?? [])];
              if (activities[activities.length - 1] !== activityText) {
                activities.push(activityText);
              }
              return { ...msg, activities };
            });
          },
          onReasoning: (delta) => {
            patchAssistant((msg) => ({
              ...msg,
              reasoning: (msg.reasoning ?? "") + delta,
            }));
          },
          onToken: (delta) => {
            patchAssistant((msg) => ({
              ...msg,
              content: msg.content + delta,
            }));
          },
          onDone: (result) => {
            patchAssistant((msg) => ({
              ...msg,
              content: result.response || msg.content,
              isStreaming: false,
            }));
            if (result.suggestion && result.original_text) {
              setPendingSuggestion({
                originalText: result.original_text,
                suggestion: result.suggestion,
                diff: result.diff ?? "",
                flags: result.integrity_flags ?? [],
                applyMode: result.apply_mode ?? "selection",
              });
            }
          },
          onError: (message) => {
            patchAssistant((msg) => ({
              ...msg,
              content: message,
              isStreaming: false,
            }));
          },
        },
        abort.signal,
      );
    } finally {
      setChatLoading(false);
      setLiveActivity(null);
      chatAbortRef.current = null;
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleAcceptSuggestion = () => {
    if (!pendingSuggestion) return;
    const { originalText, suggestion, applyMode } = pendingSuggestion;
    let next = latex;
    if (applyMode === "document") {
      next = suggestion;
    } else if (latex.includes(originalText)) {
      next = latex.replace(originalText, suggestion);
    } else {
      next = suggestion;
    }
    recordNow(next);
    setPendingSuggestion(null);
    if (autoCompile) {
      void handleCompile(next);
    }
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: autoCompile
          ? "Đã áp dụng thay đổi vào bản thảo. Đang compile PDF…"
          : "Đã áp dụng thay đổi vào bản thảo. Nhấn Ctrl+S để lưu file.",
      },
    ]);
  };

  const handleRejectSuggestion = () => {
    setPendingSuggestion(null);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Đã từ chối gợi ý. Bản thảo gốc không thay đổi." },
    ]);
  };

  const chatProps = {
    messages,
    chatInput,
    onChatInputChange: setChatInput,
    onSend: handleSend,
    chatEndRef,
    chatLoading,
    liveActivity,
    providers,
    llmProvider,
    llmModel,
    onProviderChange: (p: LLMProvider) => {
      setLlmProvider(p);
      const info = providers.find((x) => x.id === p);
      if (info) setLlmModel(info.default_model);
    },
    onModelChange: setLlmModel,
    onRefreshProviders: loadProviders,
    onOpenChat: () => setChatOpen(true),
    onCloseChat: () => setChatOpen(false),
    onUndo: undo,
    onRedo: redo,
    canUndo,
    canRedo,
    pendingSuggestion,
    onAcceptSuggestion: handleAcceptSuggestion,
    onRejectSuggestion: handleRejectSuggestion,
    isDirty,
  };

  return (
    <div className="editor-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      {showSplash && (
        <EditorEntrySplash
          exiting={splashPhase === "exiting"}
          label={bootState === "loading" ? "Loading project…" : "Opening editor…"}
        />
      )}
      {showEditor && (
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden${
            showSplash ? " invisible" : ""
          }`}
        >
      <ArionearMasthead className="hidden md:flex" />
      <MobileHeader
        projectName={projectName}
        onUpload={() => fileInputRef.current?.click()}
      />
      <MobileTabBar tab={mobileTab} onChange={setMobileTab} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".tex,.latex,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.eps,.cls,.bst,.sty,.bib"
        multiple
        className="hidden"
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
          assets={assets}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          onUpload={() => fileInputRef.current?.click()}
          onUploadAsset={() => assetInputRef.current?.click()}
          isDirty={isDirty}
        />
        <EditorDesktopPanels
          center={
            <CenterPanel
              latex={latex}
              onLatexChange={setLatex}
              onSelectionChange={setSelection}
              chatOpen={chatOpen}
              toolsOpen={toolsOpen}
              onToggleTools={() => setToolsOpen((v) => !v)}
              {...chatProps}
            />
          }
          right={
            toolsOpen ? (
              <ToolsPanel
                latex={latex}
                projectId={projectId ?? ""}
                autoCompile={autoCompile}
                onAutoCompileChange={setAutoCompile}
                onClose={() => setToolsOpen(false)}
              />
            ) : (
              <PdfPreviewPanel
                pdfData={pdfData}
                isCompiling={isCompiling}
                compileError={compileError}
                compileWarning={compileWarning}
                onCompile={() => void handleCompile()}
                projectName={projectName}
              />
            )
          }
        />
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col overflow-hidden">
        {mobileTab === "files" && (
          <MobileFilesPanel onUpload={() => fileInputRef.current?.click()} isDirty={isDirty} />
        )}
        {mobileTab === "editor" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <LatexEditor
              latex={latex}
              onLatexChange={setLatex}
              fullHeight
              reviewDiff={
                pendingSuggestion
                  ? {
                      original: pendingSuggestion.originalText,
                      suggested: pendingSuggestion.suggestion,
                    }
                  : null
              }
            />
          </div>
        )}
        {mobileTab === "preview" && (
          <PdfPreviewPanel
            pdfData={pdfData}
            isCompiling={isCompiling}
            compileError={compileError}
            compileWarning={compileWarning}
            onCompile={() => void handleCompile()}
            projectName={projectName}
            mobile
          />
        )}
      </div>

      <MobileBottomBar onOpenChat={() => setMobileChatOpen(true)} isDirty={isDirty} />
      {mobileChatOpen && (
        <MobileChatSheet onClose={() => setMobileChatOpen(false)} {...chatProps} />
      )}

      <StatusBar lineCount={latex.split("\n").length} className="hidden md:flex" />
        </div>
      )}
    </div>
  );
}

function ArionearMasthead({ className = "" }: { className?: string }) {
  const user = getSession();

  return (
    <div
      className={`editor-masthead flex shrink-0 items-center justify-between border-b border-foreground/20 bg-foreground px-4 py-1 text-[10px] font-mono-data uppercase tracking-widest text-background ${className}`}
    >
      <div className="flex items-center gap-3">
        <Link to="/" className="hover:text-[color:var(--editorial-red)] transition-colors">
          Arionear
        </Link>
        <span className="opacity-40">·</span>
        <Link to="/projects" className="hover:text-[color:var(--editorial-red)] transition-colors">
          Projects
        </Link>
        <span className="opacity-40">·</span>
        <span>LaTeX Workspace</span>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="hidden sm:inline opacity-80 normal-case tracking-normal font-sans-ui text-[11px]">
              {user.name}
            </span>
            <span className="opacity-40">·</span>
          </>
        )}
        <span className="hidden sm:inline opacity-70">{today}</span>
        <span className="text-[color:var(--editorial-red)]">Integrity Guard · On</span>
      </div>
    </div>
  );
}

function MobileHeader({
  projectName,
  onUpload,
}: {
  projectName: string;
  onUpload: () => void;
}) {
  return (
    <header className="flex md:hidden shrink-0 items-center justify-between border-b border-border/40 bg-card px-3 py-2.5">
      <Link
        to="/"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition"
      >
        <Settings className="h-4 w-4" />
      </Link>
      <span className="text-sm font-medium truncate px-2">{projectName}</span>
      <button
        onClick={onUpload}
        className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background shadow-sm transition hover:opacity-90"
      >
        Upload
      </button>
    </header>
  );
}

function MobileTabBar({ tab, onChange }: { tab: MobileTab; onChange: (t: MobileTab) => void }) {
  const tabs: { id: MobileTab; label: string }[] = [
    { id: "files", label: "Files" },
    { id: "editor", label: "Editor" },
    { id: "preview", label: "Preview" },
  ];
  return (
    <nav className="flex md:hidden shrink-0 border-b border-border/40 bg-card">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 py-3 text-sm font-medium transition ${
            tab === t.id
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}

function MobileBottomBar({ onOpenChat, isDirty = false }: { onOpenChat: () => void; isDirty?: boolean }) {
  return (
    <div className="flex md:hidden shrink-0 items-center justify-between border-t border-border/50 bg-card/95 px-3 py-2.5 backdrop-blur-sm safe-area-pb">
      <button className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm font-medium transition hover:bg-secondary">
        <FileText className="h-4 w-4 text-primary" />
        <span>main.tex</span>
        {isDirty && <span className="file-dirty-mark">*</span>}
        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <div className="flex items-center gap-2">
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground shadow-sm transition hover:bg-secondary">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenChat}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <img src={arioAvatar} alt="Chat with Ario" className="h-6 w-6 object-contain" />
        </button>
      </div>
    </div>
  );
}

function MobileFilesPanel({ onUpload, isDirty = false }: { onUpload: () => void; isDirty?: boolean }) {
  return (
    <div className="soft-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar">
      <div className="border-b border-border/40 p-4">
        <button className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm font-medium hover:bg-sidebar-accent transition">
          <span className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            Biomedical NER
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Files</span>
        <div className="flex gap-1">
          <IconBtn sm>
            <Search className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn sm onClick={onUpload}>
            <Plus className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="px-3">
        {PROJECT_FILES.map((f) => (
          <button
            key={f.name}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
              f.active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1">{f.name}</span>
            {f.active && isDirty && <span className="file-dirty-mark">*</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 px-4">
        <button
          onClick={onUpload}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
        >
          <Upload className="h-4 w-4" />
          Upload .tex file
        </button>
      </div>

      <div className="mt-6 border-t border-border/40 px-4 py-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Outline</span>
        <nav className="mt-3 flex flex-col gap-1">
          {OUTLINE_SECTIONS.map((s, i) => (
            <button
              key={s}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground/80 hover:bg-sidebar-accent/50 transition"
            >
              <span className="font-mono text-[10px] text-muted-foreground w-5">
                {String(i + 1).padStart(2, "0")}
              </span>
              {s}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto border-t border-border/40 p-4">
        <div className="flex items-start gap-2 rounded-xl bg-secondary/60 p-3">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-[color:var(--editorial-red)] shrink-0" />
          <p className="text-xs leading-snug text-muted-foreground">
            AI hỗ trợ diễn đạt — không bịa dữ liệu hay kết quả.
          </p>
        </div>
      </div>
    </div>
  );
}

function MobileChatSheet({
  onClose,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  chatEndRef,
  chatLoading,
  liveActivity,
}: {
  onClose: () => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  liveActivity?: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col md:hidden">
      <button
        className="mobile-chat-backdrop absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close chat"
      />
      <div className="mobile-chat-sheet relative mt-auto flex max-h-[88dvh] min-h-[50dvh] flex-col overflow-hidden rounded-t-2xl border-t border-border/50 bg-card shadow-[0_-8px_40px_-8px_rgba(15,23,42,0.2)]">
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={arioAvatar} alt="" className="h-8 w-8 rounded-lg object-contain" />
            <span className="text-sm font-medium">Ario</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ChatMessages
          messages={messages}
          chatEndRef={chatEndRef}
          chatLoading={chatLoading}
          liveActivity={liveActivity}
        />

        <div className="shrink-0 border-t border-border/40 p-3 safe-area-pb">
          <ChatInput
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            onSend={onSend}
            loading={chatLoading}
            placeholder="Ask anything"
          />
        </div>
      </div>
    </div>
  );
}

function LeftSidebar({
  projectName,
  assets,
  tab,
  onTabChange,
  onUpload,
  onUploadAsset,
  isDirty = false,
}: {
  projectName: string;
  assets: ProjectAsset[];
  tab: "files" | "chats";
  onTabChange: (t: "files" | "chats") => void;
  onUpload: () => void;
  onUploadAsset: () => void;
  isDirty?: boolean;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar/90 lg:w-60">
      <div className="border-b border-border p-3">
        <button className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-sidebar-accent transition">
          <span className="flex items-center gap-2 truncate">
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            {projectName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </div>

      <div className="flex border-b border-border">
        {(["files", "chats"] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition ${
              tab === t
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "files" ? (
        <>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Files</span>
            <div className="flex gap-1">
              <IconBtn sm>
                <Search className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn sm onClick={onUpload}>
                <Plus className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            <button className="flex w-full items-center gap-2 rounded-md bg-sidebar-accent px-2 py-1.5 text-left text-[13px] font-medium transition">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1">main.tex</span>
              {isDirty && <span className="file-dirty-mark">*</span>}
            </button>
            {assets.map((asset) => (
              <button
                key={asset.name}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground/80 transition hover:bg-sidebar-accent/50"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{asset.name}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2 border-t border-border p-3">
            <button
              onClick={onUpload}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload .tex (+ images)
            </button>
            <button
              onClick={onUploadAsset}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload figure files
            </button>
          </div>

          <div className="border-t border-border p-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Outline</span>
            <nav className="mt-2 flex flex-col gap-0.5">
              {OUTLINE_SECTIONS.map((s, i) => (
                <button
                  key={s}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-foreground/70 hover:bg-sidebar-accent/50 hover:text-foreground transition"
                >
                  <span className="font-mono text-[9px] text-muted-foreground w-4">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s}
                </button>
              ))}
            </nav>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {["Edit Introduction", "Citation format APA", "Reviewer reply draft"].map((label, i) => (
            <button
              key={label}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] transition ${
                i === 0 ? "bg-sidebar-accent font-medium" : "text-foreground/70 hover:bg-sidebar-accent/50"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-2.5">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 text-[color:var(--editorial-red)] shrink-0" />
          <p className="text-[10px] leading-snug text-muted-foreground">
            AI hỗ trợ diễn đạt — không bịa dữ liệu hay kết quả.
          </p>
        </div>
      </div>
    </aside>
  );
}

function LatexEditor({
  latex,
  onLatexChange,
  onSelectionChange,
  fullHeight = false,
  reviewDiff,
}: {
  latex: string;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  fullHeight?: boolean;
  reviewDiff?: { original: string; suggested: string } | null;
}) {
  if (reviewDiff) {
    return (
      <LatexDiffEditor
        originalText={reviewDiff.original}
        suggestedText={reviewDiff.suggested}
        fullHeight={fullHeight}
      />
    );
  }

  return (
    <LatexCodeEditor
      latex={latex}
      onLatexChange={onLatexChange}
      onSelectionChange={onSelectionChange}
      fullHeight={fullHeight}
    />
  );
}

function CenterPanel({
  latex,
  onLatexChange,
  onSelectionChange,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  chatOpen,
  onCloseChat,
  onOpenChat,
  toolsOpen,
  onToggleTools,
  chatEndRef,
  chatLoading,
  liveActivity,
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onRefreshProviders,
  pendingSuggestion,
  onAcceptSuggestion,
  onRejectSuggestion,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isDirty = false,
}: {
  latex: string;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  chatOpen: boolean;
  onCloseChat: () => void;
  onOpenChat: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  liveActivity?: string | null;
  isDirty?: boolean;
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onRefreshProviders?: () => void;
  pendingSuggestion?: PendingSuggestion | null;
  onAcceptSuggestion?: () => void;
  onRejectSuggestion?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}) {
  const [chatOverlayH, setChatOverlayH] = useState(52);

  return (
    <section className="editor-code-panel flex h-full min-h-0 flex-col overflow-hidden min-w-0">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2">
          <div className="editor-file-tab flex items-center gap-2 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
            <Avatar className="h-4 w-4 rounded-md">
              <AvatarImage src={arioAvatar} alt="" className="object-cover" />
              <AvatarFallback className="rounded-md text-[9px]">A</AvatarFallback>
            </Avatar>
            <span>main.tex</span>
            {isDirty && <span className="file-dirty-mark">*</span>}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="editor-history-btn"
              aria-label="Undo (Ctrl+Z)"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="editor-history-btn"
              aria-label="Redo (Ctrl+Shift+Z)"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <button
          onClick={onToggleTools}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm transition ${
            toolsOpen
              ? "bg-primary text-primary-foreground ring-2 ring-primary/20"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          <Wrench className="h-3 w-3" />
          Tools
        </button>
      </div>

      <div className="editor-workspace relative flex min-h-0 flex-1 flex-col overflow-hidden w-full">
        <div className="flex min-h-0 flex-1 w-full min-w-0">
          <LatexEditor
            latex={latex}
            onLatexChange={onLatexChange}
            onSelectionChange={onSelectionChange}
            fullHeight
            reviewDiff={
              pendingSuggestion
                ? {
                    original: pendingSuggestion.originalText,
                    suggested: pendingSuggestion.suggestion,
                  }
                : null
            }
          />
        </div>

        {pendingSuggestion && onAcceptSuggestion && onRejectSuggestion && (
          <div
            className="pointer-events-auto absolute inset-x-3 z-30"
            style={{ bottom: `calc(${chatOverlayH}px + 1.25rem)` }}
          >
            <SuggestionPanel
              originalText={pendingSuggestion.originalText}
              suggestion={pendingSuggestion.suggestion}
              diff={pendingSuggestion.diff}
              flags={pendingSuggestion.flags}
              applyMode={pendingSuggestion.applyMode}
              onAccept={onAcceptSuggestion}
              onReject={onRejectSuggestion}
            />
          </div>
        )}

        <ChatOverlay
          open={chatOpen}
          onClose={onCloseChat}
          onOpen={onOpenChat}
          messages={messages}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          onSend={onSend}
          chatEndRef={chatEndRef}
          chatLoading={chatLoading}
          liveActivity={liveActivity}
          providers={providers}
          llmProvider={llmProvider}
          llmModel={llmModel}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onHeightChange={setChatOverlayH}
          onRefreshProviders={onRefreshProviders}
        />
      </div>
    </section>
  );
}

function ToolsPanel({
  latex,
  projectId,
  autoCompile,
  onAutoCompileChange,
  onClose,
}: {
  latex: string;
  projectId: string;
  autoCompile: boolean;
  onAutoCompileChange: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ToolsTab>("info");
  const { theme, setTheme } = useTheme();
  const [citationResults, setCitationResults] = useState<Record<string, unknown>[]>([]);
  const [citationSummary, setCitationSummary] = useState("");
  const [citationLoading, setCitationLoading] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    VERSION_HISTORY.forEach((day) => {
      day.groups.forEach((group) => {
        if (group.defaultOpen) initial[group.title] = true;
      });
    });
    return initial;
  });

  const stats = computeProjectStats(latex);

  const statCards: { label: string; value: number }[] = [
    { label: "Words", value: stats.words },
    { label: "Words in Text", value: stats.wordsInText },
    { label: "Words in Headers", value: stats.wordsInHeaders },
    { label: "Words outside text", value: stats.wordsOutsideText },
    { label: "Number of headers", value: stats.headers },
    { label: "Number of figures", value: stats.figures },
    { label: "Number of math inlines", value: stats.mathInlines },
    { label: "Number of math displayed", value: stats.mathDisplayed },
  ];

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleVerifyCitations = async () => {
    if (!projectId) return;
    setCitationLoading(true);
    try {
      const result = await verifyCitations(projectId);
      setCitationResults(result.results);
      setCitationSummary(result.summary);
    } catch {
      setCitationSummary(citationErrorMessage());
    } finally {
      setCitationLoading(false);
    }
  };

  return (
    <section className="tools-panel flex h-full min-h-0 flex-col bg-secondary/20">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-3 backdrop-blur-sm">
        <nav className="tools-tab-nav flex items-center gap-1">
          {(
            [
              { id: "info" as const, label: "Project Info" },
              { id: "citations" as const, label: "Citations" },
              { id: "versions" as const, label: "Versions" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`tools-tab-btn ${tab === item.id ? "is-active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          <X className="h-3 w-3" />
          Close
        </button>
      </div>

      <div className="soft-scrollbar flex-1 overflow-y-auto p-4 md:p-5">
        {tab === "info" ? (
          <div className="tools-section">
            <h2 className="tools-section-title">Settings</h2>
            <div className="tools-setting-row">
              <div className="tools-setting-copy">
                <span className="tools-setting-label">Auto-compile PDF</span>
                <span className="tools-setting-hint">
                  Compile when you save (Ctrl+S) or accept an agent suggestion
                </span>
              </div>
              <Switch
                id="tools-auto-compile"
                checked={autoCompile}
                onCheckedChange={onAutoCompileChange}
                aria-label="Auto-compile PDF"
              />
            </div>

            <div className="tools-setting-row">
              <div className="tools-setting-copy">
                <span className="tools-setting-label">Dark mode</span>
                <span className="tools-setting-hint">
                  Use a darker workspace theme across the app
                </span>
              </div>
              <Switch
                id="tools-dark-mode"
                checked={theme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                aria-label="Dark mode"
              />
            </div>

            <h2 className="tools-section-title mt-6">Summary</h2>
            <div className="tools-stat-grid">
              {statCards.map((card) => (
                <div key={card.label} className="tools-stat-card">
                  <span className="tools-stat-label">{card.label}</span>
                  <span className="tools-stat-value">{card.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : tab === "citations" ? (
          <div className="tools-section">
            <div className="flex items-center justify-between">
              <h2 className="tools-section-title mb-0">Citation Verification</h2>
              <button
                type="button"
                onClick={handleVerifyCitations}
                disabled={citationLoading}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {citationLoading ? "Verifying…" : "Verify citations"}
              </button>
            </div>
            {citationSummary && (
              <p className="mt-3 text-sm text-muted-foreground">{citationSummary}</p>
            )}
            <ul className="mt-4 space-y-2">
              {citationResults.map((r, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border/50 bg-card px-3 py-2 text-xs"
                >
                  <span
                    className={
                      r.status === "verified" ? "text-emerald-600 font-medium" : "text-destructive font-medium"
                    }
                  >
                    {String(r.status)} — {String(r.key ?? "")}
                  </span>
                  <p className="mt-1 text-muted-foreground">{String(r.title || "No title in BibTeX")}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="tools-section">
            <div className="flex items-center gap-2">
              <h2 className="tools-section-title mb-0">Versions</h2>
              <button
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Versions help"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>

            {VERSION_HISTORY.map((day) => (
              <div key={day.date} className="mt-5">
                <p className="tools-version-date">{day.date}</p>
                <div className="mt-3 space-y-3">
                  {day.groups.map((group) => {
                    const isOpen = !!openGroups[group.title];
                    const hasMultiple = group.entries.length > 1;

                    return (
                      <div key={group.title} className="tools-version-group">
                        <button
                          type="button"
                          onClick={() => hasMultiple && toggleGroup(group.title)}
                          className={`tools-version-group-header ${hasMultiple ? "is-clickable" : ""}`}
                        >
                          <span className="font-medium text-sm">{group.title}</span>
                          {group.revisionCount && (
                            <span className="tools-version-pill">{group.revisionCount} revisions</span>
                          )}
                          {hasMultiple && (
                            <ChevronDown
                              className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                            />
                          )}
                        </button>

                        {(isOpen || !hasMultiple) && (
                          <div className="tools-version-entries">
                            {group.entries.map((entry) => (
                              <div key={entry.version} className="tools-version-entry">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="tools-version-pill">{entry.version}</span>
                                  <span className="text-xs text-muted-foreground">{entry.timeAgo}</span>
                                  <span className="tools-diff">
                                    <span className="text-emerald-600">+{entry.additions}</span>
                                    <span className="text-[color:var(--editorial-red)]">-{entry.deletions}</span>
                                  </span>
                                  {entry.badge && (
                                    <span className="tools-version-pill tools-version-pill-muted">
                                      {entry.badge}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="tools-author-badge">2</span>
                                  <span className="text-xs text-muted-foreground">{entry.author}</span>
                                  <IconBtn sm>
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </IconBtn>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatusBar({ lineCount, className = "" }: { lineCount: number; className?: string }) {
  return (
    <footer
      className={`flex h-7 shrink-0 items-center justify-between border-t border-border bg-card px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground ${className}`}
    >
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-chart-2" />
          Saved
        </span>
        <span>LaTeX</span>
        <span>UTF-8</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Ln {lineCount}</span>
        <span className="text-[color:var(--editorial-red)]">Arionear</span>
        <span className="text-primary">Editor</span>
      </div>
    </footer>
  );
}

function IconBtn({
  children,
  sm,
  onClick,
}: {
  children: React.ReactNode;
  sm?: boolean;
  onClick?: () => void;
}) {
  const size = sm ? "h-7 w-7" : "h-8 w-8";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex ${size} items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground`}
    >
      {children}
    </button>
  );
}
