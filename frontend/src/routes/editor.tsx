import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
  MessageSquare,
  FolderOpen,
  Send,
  Paperclip,
  Mic,
  Minimize2,
} from "lucide-react";

export const Route = createFileRoute("/editor")({
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

const DEFAULT_LATEX = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage[a4paper, margin=2.5cm]{geometry}

\\title{Lightweight Adapters for Biomedical NER}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
We present a transformer-based pipeline for low-resource biomedical named entity recognition.
Our approach combines contrastive pre-training with adapter-based fine-tuning.
\\end{abstract}

\\section{Introduction}
Biomedical NER remains challenging because labeled corpora are small and terminology is dense.
Prior work has shown that domain-adaptive pre-training helps, but it is computationally heavy.

\\section{Methods}
We use PubMedBERT as the backbone. Adapters are inserted in every transformer block with bottleneck dimension 64.

\\section{Results}
On BC5CDR-Chemical we obtain F1 of 92.4, on NCBI-Disease 88.1, and on JNLPBA 78.6.

\\section{Conclusion}
Adapter-based fine-tuning with contrastive warm-up is a practical recipe for low-resource biomedical NER.

\\end{document}`;

type ChatMessage = { role: "user" | "assistant"; content: string };

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

function EditorPage() {
  const [sidebarTab, setSidebarTab] = useState<"files" | "chats">("files");
  const [latex, setLatex] = useState(DEFAULT_LATEX);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  const [zoom, setZoom] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") setLatex(text);
    };
    reader.readAsText(file);
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

  return (
    <div className="editor-shell flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      <ArionearMasthead />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LeftSidebar
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          onUpload={() => fileInputRef.current?.click()}
        />
        <input ref={fileInputRef} type="file" accept=".tex,.latex" className="hidden" onChange={handleUpload} />

        <CenterPanel
          latex={latex}
          onLatexChange={setLatex}
          messages={messages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSend={handleSend}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((v) => !v)}
          chatEndRef={chatEndRef}
        />

        <PreviewPanel
          isCompiling={isCompiling}
          onCompile={handleCompile}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      </div>
      <StatusBar lineCount={latex.split("\n").length} />
    </div>
  );
}

function ArionearMasthead() {
  return (
    <div className="editor-masthead flex shrink-0 items-center justify-between border-b border-foreground/20 bg-[color:var(--ink)] px-4 py-1 text-[10px] font-mono-data uppercase tracking-widest text-[color:var(--newsprint)]">
      <div className="flex items-center gap-3">
        <Link to="/" className="hover:text-[color:var(--editorial-red)] transition-colors">
          Arionear
        </Link>
        <span className="opacity-40">·</span>
        <span>LaTeX Workspace</span>
      </div>
      <span className="hidden sm:inline opacity-70">{today}</span>
      <span className="text-[color:var(--editorial-red)]">Integrity Guard · On</span>
    </div>
  );
}

function LeftSidebar({
  tab,
  onTabChange,
  onUpload,
}: {
  tab: "files" | "chats";
  onTabChange: (t: "files" | "chats") => void;
  onUpload: () => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar/90 lg:w-60">
      <div className="border-b border-border p-3">
        <button className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-sidebar-accent transition">
          <span className="flex items-center gap-2 truncate">
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            Biomedical NER
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
            {PROJECT_FILES.map((f) => (
              <button
                key={f.name}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                  f.active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/50 text-foreground/80"
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border p-3">
            <button
              onClick={onUpload}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload .tex file
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
                  <span className="font-mono text-[9px] text-muted-foreground w-4">{String(i + 1).padStart(2, "0")}</span>
                  {s}
                </button>
              ))}
            </nav>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          <button className="flex w-full items-center gap-2 rounded-md bg-sidebar-accent px-2 py-2 text-left text-[13px] font-medium">
            <MessageSquare className="h-3.5 w-3.5" />
            Edit Introduction
          </button>
          <button className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-foreground/70 hover:bg-sidebar-accent/50 transition">
            <MessageSquare className="h-3.5 w-3.5" />
            Citation format APA
          </button>
          <button className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-foreground/70 hover:bg-sidebar-accent/50 transition">
            <MessageSquare className="h-3.5 w-3.5" />
            Reviewer reply draft
          </button>
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

function CenterPanel({
  latex,
  onLatexChange,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  chatOpen,
  onToggleChat,
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
  chatEndRef: React.RefObject<HTMLDivElement | null>;
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
    <section className="flex flex-1 min-h-0 flex-col overflow-hidden min-w-0 bg-secondary/20">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary/80 transition lg:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm">
            <FileText className="h-3 w-3" />
            main.tex
          </div>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90">
          <Sparkles className="h-3 w-3" />
          Tools
        </button>
      </div>

      <div className={`flex min-h-0 flex-col p-3 ${chatOpen ? "flex-1" : "flex-[2]"}`}>
        <div className="latex-editor-shell flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border/50 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.12)]">
          <div
            ref={gutterRef}
            className="latex-gutter shrink-0 overflow-hidden select-none py-4 pr-3 pl-4 text-right font-mono text-[11px] leading-[1.65]"
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
            className="latex-input soft-scrollbar min-h-0 flex-1 resize-none overflow-y-auto overflow-x-auto bg-transparent py-4 pr-5 font-mono text-[13px] leading-[1.65] outline-none"
          />
        </div>
      </div>

      {chatOpen && (
        <div className="flex h-[38%] min-h-[200px] max-h-[380px] shrink-0 flex-col px-3 pb-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-[0_-4px_24px_-8px_rgba(15,23,42,0.08)]">
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

            <div className="soft-scrollbar flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary/80 text-foreground rounded-bl-md"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="shrink-0 border-t border-border/40 p-3">
              <div className="flex items-end gap-2 rounded-xl border border-border/50 bg-background/80 px-3 py-2.5 shadow-inner transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                <textarea
                  value={chatInput}
                  onChange={(e) => onChatInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  placeholder="Ask anything — e.g. improve the Introduction section..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
                />
                <div className="flex items-center gap-1 shrink-0 pb-0.5">
                  <IconBtn sm>
                    <Paperclip className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn sm>
                    <Mic className="h-3.5 w-3.5" />
                  </IconBtn>
                  <button
                    onClick={onSend}
                    disabled={!chatInput.trim()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!chatOpen && (
        <button
          onClick={onToggleChat}
          className="mx-3 mb-3 flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border/50 bg-card text-xs text-muted-foreground shadow-sm transition hover:bg-secondary/50 hover:text-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Open AI Assistant
        </button>
      )}
    </section>
  );
}

function PreviewPanel({
  isCompiling,
  onCompile,
  zoom,
  onZoomChange,
}: {
  isCompiling: boolean;
  onCompile: () => void;
  zoom: number;
  onZoomChange: (z: number) => void;
}) {
  return (
    <section className="hidden md:flex w-[42%] min-h-0 min-w-[320px] flex-col border-l border-border/60 bg-secondary/20 lg:min-w-[380px]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm">
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
          <IconBtn sm>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="soft-scrollbar flex-1 overflow-y-auto bg-muted/30 p-5 lg:p-7">
        <div
          className="mx-auto max-w-lg rounded-lg border border-border/40 bg-white shadow-[0_8px_32px_-12px_rgba(15,23,42,0.15)] transition-transform origin-top"
          style={{ transform: `scale(${zoom / 100})` }}
        >
          <div className="px-10 py-12 font-serif-prose text-[13px] leading-[1.7] text-gray-900">
            <h1 className="text-center text-xl font-bold mb-1 font-serif-display">
              Lightweight Adapters for Biomedical NER
            </h1>
            <p className="text-center text-sm text-gray-600 mb-1">Author Name</p>
            <p className="text-center text-xs text-gray-500 mb-8">{today}</p>

            <p className="text-justify mb-4">
              <strong>Abstract.</strong> We present a transformer-based pipeline for low-resource biomedical
              named entity recognition. Our approach combines contrastive pre-training with adapter-based
              fine-tuning.
            </p>

            <h2 className="text-base font-bold mt-6 mb-2">1 Introduction</h2>
            <p className="text-justify mb-3">
              Biomedical NER remains challenging because labeled corpora are small and terminology is dense.
              Prior work has shown that domain-adaptive pre-training helps, but it is computationally heavy.
            </p>

            <h2 className="text-base font-bold mt-6 mb-2">2 Methods</h2>
            <p className="text-justify mb-3">
              We use PubMedBERT as the backbone. Adapters are inserted in every transformer block with
              bottleneck dimension 64.
            </p>

            <h2 className="text-base font-bold mt-6 mb-2">3 Results</h2>
            <p className="text-justify mb-3">
              On BC5CDR-Chemical we obtain F1 of 92.4, on NCBI-Disease 88.1, and on JNLPBA 78.6.
            </p>

            <h2 className="text-base font-bold mt-6 mb-2">4 Conclusion</h2>
            <p className="text-justify">
              Adapter-based fine-tuning with contrastive warm-up is a practical recipe for low-resource
              biomedical NER.
            </p>
          </div>
        </div>
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
        <span className="font-mono text-[10px] text-muted-foreground w-8 text-center">{zoom}%</span>
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

function StatusBar({ lineCount }: { lineCount: number }) {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-card px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
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
