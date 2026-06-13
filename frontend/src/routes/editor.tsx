import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ShieldCheck,
  ArrowLeft,
  Plus,
  Upload,
  RefreshCw,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  FolderOpen,
  Send,
  Paperclip,
  Mic,
  Minimize2,
  Settings,
  X,
  HelpCircle,
  Wrench,
} from "lucide-react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  addProjectAssets,
  getProject,
  isImageAssetFile,
  readFileAsDataUrl,
  resolveProjectAsset,
  SAMPLE_LATEX,
  updateProject,
  type ProjectAsset,
} from "@/lib/project-store";
import {
  parseLatexPreview,
  renderPreviewParagraph,
} from "@/lib/latex-preview";

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

type ChatMessage = { role: "user" | "assistant"; content: string };
type MobileTab = "files" | "editor" | "preview";

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Xin chào! Tôi có thể giúp bạn cải thiện văn phong học thuật, cấu trúc bài báo, hoặc định dạng trích dẫn trong `main.tex`. Bạn muốn bắt đầu từ phần nào?",
  },
];

const PROJECT_FILES = [
  { name: "main.tex", active: true },
  { name: "references.bib", active: false },
  { name: "figures/fig1.pdf", active: false },
];

const OUTLINE_SECTIONS = ["Abstract", "Introduction", "Methods", "Results", "Conclusion"];

const PREVIEW_PAGE_WIDTH = 480;
const CHAT_DOCK_COLLAPSED_H = 40;

type ToolsTab = "info" | "versions";

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
  const [projectName] = useState(() => {
    if (projectId) {
      const project = getProject(projectId);
      if (project) return project.name;
    }
    return "Untitled Project";
  });
  const [latex, setLatex] = useState(() => {
    if (projectId) {
      const project = getProject(projectId);
      if (project) return project.latex;
    }
    return SAMPLE_LATEX;
  });
  const [assets, setAssets] = useState<ProjectAsset[]>(() => {
    if (projectId) {
      const project = getProject(projectId);
      if (project?.assets) return project.assets;
    }
    return [];
  });
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [toolsOpen, setToolsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) {
      navigate({ to: "/projects", replace: true });
      return;
    }
    if (!getProject(projectId)) {
      navigate({ to: "/projects", replace: true });
    }
  }, [projectId, navigate]);

  useEffect(() => {
    if (!projectId) return;
    updateProject(projectId, { latex });
  }, [latex, projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const texFile = files.find((f) => /\.(tex|latex)$/i.test(f.name));
    const imageFiles = files.filter((f) => isImageAssetFile(f.name));

    if (texFile) {
      const text = await texFile.text();
      setLatex(text);
    }

    if (imageFiles.length && projectId) {
      const uploaded = await Promise.all(imageFiles.map(readFileAsDataUrl));
      const updated = addProjectAssets(projectId, uploaded);
      if (updated?.assets) setAssets(updated.assets);
    }

    e.target.value = "";
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !projectId) return;

    const imageFiles = files.filter((f) => isImageAssetFile(f.name));
    if (!imageFiles.length) return;

    const uploaded = await Promise.all(imageFiles.map(readFileAsDataUrl));
    const updated = addProjectAssets(projectId, uploaded);
    if (updated?.assets) setAssets(updated.assets);
    e.target.value = "";
  };

  const handleSend = () => {
    const text = chatInput.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setChatInput("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Tôi đã xem xét `main.tex`. Gợi ý: thay \"remains challenging because\" bằng \"remains challenging due to\" để văn phong học thuật hơn. Tôi không thêm kết quả hay trích dẫn mới — chỉ cải thiện cách diễn đạt. Bạn có muốn tôi áp dụng thay đổi này không?",
        },
      ]);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 800);
  };

  const handleCompile = () => {
    setIsCompiling(true);
    setTimeout(() => setIsCompiling(false), 1200);
  };

  const chatProps = {
    messages,
    chatInput,
    onChatInputChange: setChatInput,
    onSend: handleSend,
    chatEndRef,
  };

  return (
    <div className="editor-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <ArionearMasthead className="hidden md:flex" />
      <MobileHeader
        projectName={projectName}
        onUpload={() => fileInputRef.current?.click()}
      />
      <MobileTabBar tab={mobileTab} onChange={setMobileTab} />

      <input
        ref={fileInputRef}
        type="file"
        accept=".tex,.latex,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.eps"
        multiple
        className="hidden"
        onChange={handleUpload}
      />
      <input
        ref={assetInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.eps"
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
        />
        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          <ResizablePanel defaultSize={58} minSize={28} className="min-w-0">
            <CenterPanel
              latex={latex}
              onLatexChange={setLatex}
              chatOpen={chatOpen}
              onToggleChat={() => setChatOpen((v) => !v)}
              toolsOpen={toolsOpen}
              onToggleTools={() => setToolsOpen((v) => !v)}
              {...chatProps}
            />
          </ResizablePanel>
          <ResizableHandle className="editor-resize-handle" />
          <ResizablePanel defaultSize={42} minSize={22} className="min-w-0">
            {toolsOpen ? (
              <ToolsPanel latex={latex} onClose={() => setToolsOpen(false)} />
            ) : (
              <PreviewPanel
                latex={latex}
                assets={assets}
                isCompiling={isCompiling}
                onCompile={handleCompile}
                zoom={zoom}
                onZoomChange={setZoom}
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-1 min-h-0 flex-col overflow-hidden">
        {mobileTab === "files" && (
          <MobileFilesPanel onUpload={() => fileInputRef.current?.click()} />
        )}
        {mobileTab === "editor" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <LatexEditor latex={latex} onLatexChange={setLatex} fullHeight />
          </div>
        )}
        {mobileTab === "preview" && (
          <PreviewPanel
            latex={latex}
            assets={assets}
            isCompiling={isCompiling}
            onCompile={handleCompile}
            zoom={zoom}
            onZoomChange={setZoom}
            mobile
          />
        )}
      </div>

      <MobileBottomBar onOpenChat={() => setMobileChatOpen(true)} />
      {mobileChatOpen && (
        <MobileChatSheet onClose={() => setMobileChatOpen(false)} {...chatProps} />
      )}

      <StatusBar lineCount={latex.split("\n").length} className="hidden md:flex" />
    </div>
  );
}

function ArionearMasthead({ className = "" }: { className?: string }) {
  return (
    <div
      className={`editor-masthead flex shrink-0 items-center justify-between border-b border-foreground/20 bg-[color:var(--ink)] px-4 py-1 text-[10px] font-mono-data uppercase tracking-widest text-[color:var(--newsprint)] ${className}`}
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
      <span className="hidden sm:inline opacity-70">{today}</span>
      <span className="text-[color:var(--editorial-red)]">Integrity Guard · On</span>
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

function MobileBottomBar({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <div className="flex md:hidden shrink-0 items-center justify-between border-t border-border/50 bg-card/95 px-3 py-2.5 backdrop-blur-sm safe-area-pb">
      <button className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm font-medium transition hover:bg-secondary">
        <FileText className="h-4 w-4 text-primary" />
        <span>main.tex</span>
        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <div className="flex items-center gap-2">
        <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border/50 bg-background text-muted-foreground shadow-sm transition hover:bg-secondary">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenChat}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function MobileFilesPanel({ onUpload }: { onUpload: () => void }) {
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
            {f.name}
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
}: {
  onClose: () => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
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
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium">AI Assistant</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ChatMessages messages={messages} chatEndRef={chatEndRef} />

        <div className="shrink-0 border-t border-border/40 p-3 safe-area-pb">
          <ChatInput
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            onSend={onSend}
            placeholder="Ask anything about your manuscript..."
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
}: {
  projectName: string;
  assets: ProjectAsset[];
  tab: "files" | "chats";
  onTabChange: (t: "files" | "chats") => void;
  onUpload: () => void;
  onUploadAsset: () => void;
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
              <span className="truncate">main.tex</span>
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
  fullHeight = false,
}: {
  latex: string;
  onLatexChange: (v: string) => void;
  fullHeight?: boolean;
}) {
  const lines = latex.split("\n");
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncGutterScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div
      className={`latex-editor-shell flex min-h-0 overflow-hidden ${
        fullHeight ? "h-full rounded-none border-0 shadow-none" : "flex-1 rounded-xl border border-border/50 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)]"
      }`}
    >
      <div
        ref={gutterRef}
        className="latex-gutter shrink-0 overflow-hidden select-none py-4 pr-2 pl-3 md:pr-3 md:pl-4 text-right font-mono text-[11px] leading-[1.65]"
      >
        {lines.map((_, i) => (
          <div key={i} className="latex-line-num">
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        value={latex}
        onChange={(e) => onLatexChange(e.target.value)}
        onScroll={syncGutterScroll}
        spellCheck={false}
        className="latex-input soft-scrollbar min-h-0 flex-1 resize-none overflow-y-auto overflow-x-auto bg-transparent py-4 pr-4 md:pr-5 font-mono text-[12px] md:text-[13px] leading-[1.65] outline-none"
      />
    </div>
  );
}

function ChatMessages({
  messages,
  chatEndRef,
}: {
  messages: ChatMessage[];
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="soft-scrollbar chat-messages flex-1 overflow-y-auto px-4 py-4">
      {messages.map((m, i) => (
        <div
          key={i}
          className={`chat-message-row flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
        >
          <div
            className={`chat-bubble max-w-[88%] text-[13px] leading-relaxed ${
              m.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"
            }`}
          >
            {m.content}
          </div>
        </div>
      ))}
      <div ref={chatEndRef} />
    </div>
  );
}

function ChatInput({
  chatInput,
  onChatInputChange,
  onSend,
  placeholder,
}: {
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  placeholder: string;
}) {
  return (
    <div className="chat-input-shell">
      <textarea
        value={chatInput}
        onChange={(e) => onChatInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        className="chat-input-field"
      />
      <div className="chat-input-actions">
        <IconBtn sm>
          <Paperclip className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn sm>
          <Mic className="h-3.5 w-3.5" />
        </IconBtn>
        <button
          onClick={onSend}
          disabled={!chatInput.trim()}
          className="chat-send-btn"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function CenterPanel({
  latex,
  onLatexChange,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  chatOpen,
  onToggleChat,
  toolsOpen,
  onToggleTools,
  chatEndRef,
}: {
  latex: string;
  onLatexChange: (v: string) => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [expandedH, setExpandedH] = useState(320);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const update = () => {
      setExpandedH(Math.min(380, Math.max(200, Math.round(el.clientHeight * 0.38))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="flex h-full min-h-0 flex-col overflow-hidden min-w-0 bg-secondary/20"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm">
          <FileText className="h-3 w-3" />
          main.tex
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

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <LatexEditor latex={latex} onLatexChange={onLatexChange} />
      </div>

      <div
        className="chat-dock mx-3 mb-3 shrink-0"
        data-open={chatOpen}
        style={{ height: chatOpen ? expandedH : CHAT_DOCK_COLLAPSED_H }}
      >
        <button
          type="button"
          onClick={onToggleChat}
          className="chat-dock-trigger"
          aria-hidden={chatOpen}
          tabIndex={chatOpen ? -1 : 0}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Open AI Assistant</span>
        </button>

        <div
          className="chat-dock-panel"
          aria-hidden={!chatOpen}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/40 px-4">
            <div className="flex items-center gap-2 text-xs font-medium">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              AI Assistant
            </div>
            <div className="flex gap-1">
              <IconBtn sm>
                <RefreshCw className="h-3 w-3" />
              </IconBtn>
              <IconBtn sm onClick={onToggleChat}>
                <Minimize2 className="h-3 w-3" />
              </IconBtn>
            </div>
          </div>
          <div className="chat-dock-body flex min-h-0 flex-1 flex-col">
            <ChatMessages messages={messages} chatEndRef={chatEndRef} />
            <div className="shrink-0 border-t border-border/40 p-3">
              <ChatInput
                chatInput={chatInput}
                onChatInputChange={onChatInputChange}
                onSend={onSend}
                placeholder="Ask anything — e.g. improve the Introduction section..."
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToolsPanel({ latex, onClose }: { latex: string; onClose: () => void }) {
  const [tab, setTab] = useState<ToolsTab>("info");
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

  return (
    <section className="tools-panel flex h-full min-h-0 flex-col bg-secondary/20">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-3 backdrop-blur-sm">
        <nav className="tools-tab-nav flex items-center gap-1">
          {(
            [
              { id: "info" as const, label: "Project Info" },
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
            <h2 className="tools-section-title">Summary</h2>
            <div className="tools-stat-grid">
              {statCards.map((card) => (
                <div key={card.label} className="tools-stat-card">
                  <span className="tools-stat-label">{card.label}</span>
                  <span className="tools-stat-value">{card.value}</span>
                </div>
              ))}
            </div>
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

function PreviewFigure({
  block,
  assets,
}: {
  block: Extract<ReturnType<typeof parseLatexPreview>["blocks"][number], { type: "figure" }>;
  assets: ProjectAsset[];
}) {
  const imageUrl = block.src ? resolveProjectAsset(block.src, assets) : null;
  const displayName = block.src?.split("/").pop() ?? "figure";

  return (
    <figure className="preview-figure my-5">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={block.caption ?? displayName}
          className="preview-figure-img mx-auto block max-h-56 w-full object-contain"
        />
      ) : (
        <div className="preview-figure-missing mx-auto flex min-h-[9rem] max-w-full items-center justify-center border border-gray-300 bg-white px-4 py-6 text-center text-xs text-gray-500">
          {displayName}
        </div>
      )}
      {block.caption && (
        <figcaption className="preview-figure-caption mt-2 text-center text-xs text-gray-700">
          Figure {block.number}: {renderPreviewParagraph(block.caption)}
        </figcaption>
      )}
    </figure>
  );
}

function PreviewDocument({
  latex,
  assets,
  scale,
}: {
  latex: string;
  assets: ProjectAsset[];
  scale: number;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const preview = useMemo(() => parseLatexPreview(latex), [latex]);
  const previewFontClass =
    preview.fontProfile === "times" ? "preview-font-times" : "preview-font-latin-modern";

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const update = () => setPageHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview]);

  return (
    <div
      className="preview-page-scaler mx-auto"
      style={{ width: PREVIEW_PAGE_WIDTH * scale, height: pageHeight * scale }}
    >
      <div
        ref={pageRef}
        className="preview-page rounded-lg border border-border/40 bg-white shadow-[0_8px_32px_-12px_rgba(15,23,42,0.15)]"
        style={{
          width: PREVIEW_PAGE_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div className={`preview-page-content px-10 py-12 text-gray-900 ${previewFontClass}`}>
          {preview.blocks.length === 0 ? (
            <p className="text-center text-sm text-gray-500">
              Upload or write LaTeX to see a live preview.
            </p>
          ) : (
            preview.blocks.map((block, index) => {
              switch (block.type) {
                case "title":
                  return (
                    <h1
                      key={`${block.type}-${index}`}
                      className="preview-title text-center mb-1"
                    >
                      {block.text}
                    </h1>
                  );
                case "author":
                  return (
                    <p key={`${block.type}-${index}`} className="text-center mb-1">
                      {block.text}
                    </p>
                  );
                case "date":
                  return (
                    <p key={`${block.type}-${index}`} className="text-center text-[0.85em] mb-8">
                      {block.text}
                    </p>
                  );
                case "abstract":
                  return (
                    <p key={`${block.type}-${index}`} className="text-justify mb-4">
                      <strong>Abstract.</strong> {renderPreviewParagraph(block.text)}
                    </p>
                  );
                case "section":
                  return (
                    <h2 key={`${block.type}-${index}`} className="preview-section mt-6 mb-2">
                      {block.numbered ? `${block.number} ` : ""}
                      {block.title}
                    </h2>
                  );
                case "subsection":
                  return (
                    <h3 key={`${block.type}-${index}`} className="preview-subsection mt-4 mb-2">
                      {block.numbered ? `${block.number}. ` : ""}
                      {block.title}
                    </h3>
                  );
                case "figure":
                  return <PreviewFigure key={`${block.type}-${index}`} block={block} assets={assets} />;
                case "equation":
                  return (
                    <div
                      key={`${block.type}-${index}`}
                      className="my-3 text-center font-latex-mono text-sm text-gray-700"
                    >
                      {block.text}
                    </div>
                  );
                case "paragraph":
                  return (
                    <p key={`${block.type}-${index}`} className="text-justify mb-3">
                      {renderPreviewParagraph(block.text)}
                    </p>
                  );
                default:
                  return null;
              }
            })
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({
  latex,
  assets,
  isCompiling,
  onCompile,
  zoom,
  onZoomChange,
  mobile = false,
}: {
  latex: string;
  assets: ProjectAsset[];
  isCompiling: boolean;
  onCompile: () => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  mobile?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateScale = () => {
      const padding = 40;
      const available = el.clientWidth - padding;
      setFitScale(Math.min(1, Math.max(0.25, available / PREVIEW_PAGE_WIDTH)));
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const effectiveScale = zoom === 100 ? fitScale : zoom / 100;
  const displayZoom = Math.round(effectiveScale * 100);

  return (
    <section
      className={`flex min-h-0 flex-col bg-secondary/20 ${
        mobile ? "flex-1 w-full" : "h-full w-full"
      }`}
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-3 md:px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={onCompile}
            disabled={isCompiling}
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isCompiling ? "animate-spin" : ""}`} />
            {isCompiling ? "Compiling…" : "Compile"}
          </button>
          <span className="font-mono text-[10px] text-muted-foreground">01 of 01</span>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="rounded-md bg-transparent px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-secondary focus:outline-none"
          >
            <option value={75}>75%</option>
            <option value={100}>Zoom to fit</option>
            <option value={125}>125%</option>
          </select>
          <IconBtn sm>
            <Download className="h-3.5 w-3.5" />
          </IconBtn>
          {!mobile && (
            <IconBtn sm>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </IconBtn>
          )}
        </div>
      </div>

      <div
        ref={viewportRef}
        className="preview-viewport soft-scrollbar flex-1 overflow-y-auto overflow-x-hidden bg-muted/30 p-4 md:p-5 lg:p-7"
      >
        <PreviewDocument latex={latex} assets={assets} scale={effectiveScale} />
      </div>

      <div className="flex h-9 shrink-0 items-center justify-center gap-2 border-t border-border bg-card/80">
        <IconBtn sm>
          <ChevronLeft className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn sm>
          <ChevronRight className="h-3.5 w-3.5" />
        </IconBtn>
        <div className="mx-1 h-4 w-px bg-border" />
        <IconBtn sm onClick={() => onZoomChange(Math.max(50, zoom - 25))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </IconBtn>
        <span className="font-mono text-[10px] text-muted-foreground w-8 text-center">{displayZoom}%</span>
        <IconBtn sm onClick={() => onZoomChange(Math.min(200, zoom + 25))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </IconBtn>
      </div>
    </section>
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
      onClick={onClick}
      className={`flex ${size} items-center justify-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground`}
    >
      {children}
    </button>
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
