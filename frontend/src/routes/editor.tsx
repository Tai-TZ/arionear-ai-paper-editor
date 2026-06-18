import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { requireAuth } from "@/lib/require-auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  Sparkles,
} from "lucide-react";
import { getSession } from "@/lib/auth-store";
import {
  formatTimeAgo,
  getCompilePayload,
  isImageAssetFile,
  isProjectAssetFile,
  isTexFile,
  normalizeAssetName,
  readFileAsDataUrl,
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
  applyAiState,
  compileLatex,
  fetchCitationRegistry,
  fetchProviders,
  fetchRevisions,
  revisionAction,
  streamChat,
  syncSession,
  verifyCitations,
  type ChatAiStatePayload,
  type ChatAiStep,
  type LLMProvider,
  type ProviderInfo,
  type RevisionRecord,
} from "@/lib/api/academic";
import { importOverleafZip } from "@/lib/overleaf-import";
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
import { LatexCodeEditor, type LatexCodeEditorHandle } from "@/components/latex-code-editor";
import { EditorSelectionToolbar } from "@/components/editor-selection-toolbar";
import {
  type EditorSelectionContext,
  type SelectionAnchor,
} from "@/lib/editor-selection-anchor";
import { clampSelectionReplacement } from "@/lib/inline-suggestion";
import { LlmSelector } from "@/components/llm-selector";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import {
  EditorEntrySplash,
} from "@/components/editor-entry-splash";
import { EditorDesktopPanels } from "@/components/editor-desktop-panels";
import { EditableProjectName } from "@/components/editable-project-name";
import { LatexOutlineNav } from "@/components/latex-outline-nav";
import { resolveSynctexWordHighlight, type SynctexWordHighlight } from "@/lib/synctex-highlight";
import { useLatexHistory } from "@/lib/use-latex-history";
import { fetchDedupe, invalidateFetchKey } from "@/lib/api/fetch-dedupe";
import { fetchResearcherProfile } from "@/lib/api/profile-api";
import { getCachedProfile, type ResearcherProfile } from "@/lib/researcher-profile";
import { SHOW_EDITOR_IMPORT } from "@/components/workspace/workspace-layout";

type EditorSearch = {
  projectId?: string;
};

export const Route = createFileRoute("/editor")({
  ssr: false,
  beforeLoad: () => {
    requireAuth();
  },
  validateSearch: (search: Record<string, unknown>): EditorSearch => {
    const raw = search.projectId;
    const projectId =
      typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
    return { projectId };
  },
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
  selectionStart?: number;
  selectionEnd?: number;
};

type PendingEdit = {
  id: string;
  file: string;
  section?: string;
  applyMode: "selection" | "document";
  originalText: string;
  replacementText: string;
  description?: string;
  flags: { code: string; message: string; severity: string }[];
  revisionId?: string;
  accepted?: boolean;
  selectionStart?: number;
  selectionEnd?: number;
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Xin chào — tôi là Ario, trợ lý NCKH trong Paper IDE ARIONEAR. Bạn có thể giao task tự do: sửa tên/tác giả, viết lại Abstract, chỉnh văn phong học thuật, kiểm tra cấu trúc IMRAD, hoặc hỏi về LaTeX. Chọn provider/model bên dưới rồi mô tả việc cần làm.",
  },
];

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

function parseCompileErrorLine(error: string): number | undefined {
  const lineMatch = error.match(/:(\d+):/);
  if (lineMatch) return Number.parseInt(lineMatch[1], 10);
  const latexMatch = error.match(/l\.(\d+)/);
  if (latexMatch) return Number.parseInt(latexMatch[1], 10);
  return undefined;
}

function countDiffStats(original: string, suggestion: string) {
  const o = original.length;
  const s = suggestion.length;
  if (s >= o) return { additions: s - o, deletions: 0 };
  return { additions: 0, deletions: o - s };
}

function toInlineSuggestion(
  pendingEdits: PendingEdit[] | null | undefined,
  activeEditId: string | null | undefined,
  pendingSuggestion: PendingSuggestion | null | undefined,
) {
  const withSelectionScope = (input: {
    originalText: string;
    suggestion: string;
    applyMode?: "selection" | "document";
    selectionStart?: number;
    selectionEnd?: number;
  }) => {
    const hasAnchor =
      input.selectionStart != null &&
      input.selectionEnd != null &&
      input.selectionEnd > input.selectionStart;
    return hasAnchor ? { ...input, applyMode: "selection" as const } : input;
  };

  if (pendingEdits?.length) {
    const edit = pendingEdits.find((e) => e.id === activeEditId) ?? pendingEdits[0];
    return withSelectionScope({
      originalText: edit.originalText,
      suggestion: edit.replacementText,
      applyMode: edit.applyMode,
      selectionStart: edit.selectionStart,
      selectionEnd: edit.selectionEnd,
    });
  }
  if (pendingSuggestion) {
    return withSelectionScope({
      originalText: pendingSuggestion.originalText,
      suggestion: pendingSuggestion.suggestion,
      applyMode: pendingSuggestion.applyMode,
      selectionStart: pendingSuggestion.selectionStart,
      selectionEnd: pendingSuggestion.selectionEnd,
    });
  }
  return null;
}

function revisionActionLabel(action: string) {
  switch (action.toLowerCase()) {
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "modified":
      return "Modified";
    default:
      return "Pending";
  }
}

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
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [liveActivity, setLiveActivity] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState("");
  const [selectionPick, setSelectionPick] = useState<{
    context: EditorSelectionContext;
    anchor: SelectionAnchor;
  } | null>(null);
  const [chatSelectionContext, setChatSelectionContext] = useState<EditorSelectionContext | null>(
    null,
  );
  const [chatComposerMode, setChatComposerMode] = useState<"normal" | "quick-edit">("normal");
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[] | null>(null);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [revisionHistory, setRevisionHistory] = useState<RevisionRecord[]>([]);
  const [citationResults, setCitationResults] = useState<Record<string, unknown>[]>([]);
  const [citationSummary, setCitationSummary] = useState("");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("openrouter");
  const [llmModel, setLlmModel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const latexEditorRef = useRef<LatexCodeEditorHandle>(null);
  const synctexFlashRef = useRef(0);
  const pendingSynctexRef = useRef<{
    line: number;
    word?: string;
    column?: number;
    context?: string;
    latex?: string;
  } | null>(null);

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
        setLlmProvider(profile.default_llm_provider);
        if (profile.default_llm_model) setLlmModel(profile.default_llm_model);
      })
      .catch(() => {
        const cached = getCachedProfile();
        if (!cached || cancelled) return;
        profilePrefsRef.current = cached;
        setAutoCompile(cached.auto_compile);
        setAutoSave(cached.auto_save);
        setSynctexHighlightMs(cached.synctex_highlight_ms);
        setIntegrityStrictness(cached.integrity_strictness);
        setLlmProvider(cached.default_llm_provider);
        if (cached.default_llm_model) setLlmModel(cached.default_llm_model);
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

  const refreshRevisions = useCallback(() => {
    if (!projectId) return;
    void fetchRevisions(projectId).then(setRevisionHistory).catch(() => {});
  }, [projectId]);

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
        setBootState("ready");
        void loadSessionAudit(projectId);
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

  const persistActiveFile = useCallback(
    (content: string, files: ProjectFile[], currentActive: string) =>
      files.map((f) => (f.path === currentActive ? { ...f, content } : f)),
    [],
  );

  const switchActiveFile = useCallback(
    (nextPath: string) => {
      if (nextPath === activeFile) return;
      const updatedFiles = persistActiveFile(latex, projectFiles, activeFile);
      const nextFile = updatedFiles.find((f) => f.path === nextPath);
      setProjectFiles(updatedFiles);
      setActiveFile(nextPath);
      resetHistory(nextFile?.content ?? "");
      setSavedLatex(nextFile?.content ?? "");
    },
    [activeFile, latex, persistActiveFile, projectFiles, resetHistory],
  );

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
    const filesWithActive = persistActiveFile(latexOverride ?? latex, projectFiles, activeFile);
    setIsCompiling(true);
    setCompileError(null);
    setCompileWarning(null);
    setCompileLog(null);
    try {
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
      const result = await compileLatex(payload.latex, payload.assets, {
        mainFile: payload.mainFile,
        compiler: payload.compiler,
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
      } else {
        const detail = [result.error, result.log?.slice(-4000)].filter(Boolean).join("\n\n");
        setCompileError(detail || "Compilation failed.");
      }
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "Compilation failed.");
    } finally {
      setIsCompiling(false);
    }
  }, [latex, assets, projectFiles, activeFile, mainFile, compiler, projectId, projectName, persistActiveFile]);

  const handleSave = useCallback(() => {
    if (!projectId) return;
    const files = persistActiveFile(latex, projectFiles, activeFile);
    setProjectFiles(files);
    const mainContent = files.find((f) => f.path === mainFile)?.content ?? latex;
    updatePaper(projectId, {
      name: projectName,
      latex: mainContent,
      files,
      mainFile,
      compiler,
      assets,
    })
      .then(() => {
        setSavedLatex(latex);
        syncSession(projectId, projectName, mainContent).catch(() => {});
        if (autoCompile) {
          void handleCompile(latex);
        }
      })
      .catch(() => {});
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
    handleCompile,
    persistActiveFile,
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
    void fetchDedupe(`session:init:${projectId}`, () =>
      syncSession(projectId, projectName, latex),
    ).catch(() => {});
  }, [bootState, projectId, projectName, latex]);

  const loadProviders = useCallback(() => {
    fetchProviders()
      .then((data) => {
        setProviders(data.providers);
        const profile = profilePrefsRef.current;
        const profileProvider = profile?.default_llm_provider;
        const preferred =
          profileProvider && data.providers.some((p) => p.id === profileProvider)
            ? profileProvider
            : data.default_provider;
        setLlmProvider(preferred as LLMProvider);
        const providerInfo = data.providers.find((p) => p.id === preferred);
        const preferredModel = profile?.default_llm_model;
        if (preferredModel && providerInfo?.models.some((m) => m.id === preferredModel)) {
          setLlmModel(preferredModel);
        } else if (providerInfo) {
          setLlmModel(providerInfo.default_model);
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

  useEffect(() => {
    if (chatLoading) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const texFiles = files.filter((f) => isTexFile(f.name));
    const assetFiles = files.filter((f) => isProjectAssetFile(f.name));

    if (texFiles.length) {
      const imported = await Promise.all(
        texFiles.map(async (f) => ({
          path: normalizeAssetName(f.name),
          content: await f.text(),
        })),
      );
      const merged = [...projectFiles];
      for (const file of imported) {
        const idx = merged.findIndex((f) => f.path === file.path);
        if (idx >= 0) merged[idx] = file;
        else merged.push(file);
      }
      setProjectFiles(merged);
      const open = imported[0];
      if (open) {
        setActiveFile(open.path);
        recordNow(open.content);
      }
    }

    if (assetFiles.length && projectId) {
      const uploaded = await Promise.all(assetFiles.map(readFileAsDataUrl));
      const updated = await addPaperAssets(projectId, uploaded);
      if (updated.assets) setAssets(updated.assets);
    }

    e.target.value = "";
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    try {
      const imported = await importOverleafZip(file);
      setProjectFiles(imported.files);
      setMainFile(imported.mainFile);
      setActiveFile(imported.mainFile);
      setCompiler(imported.compiler);
      recordNow(imported.files.find((f) => f.path === imported.mainFile)?.content ?? "");
      if (imported.assets.length) {
        const updated = await addPaperAssets(projectId, imported.assets);
        if (updated.assets) setAssets(updated.assets);
      }
      const mainContent =
        imported.files.find((f) => f.path === imported.mainFile)?.content ?? "";
      await updatePaper(projectId, {
        name: imported.name,
        latex: mainContent,
        files: imported.files,
        mainFile: imported.mainFile,
        compiler: imported.compiler,
        assets: imported.assets.length ? imported.assets : assets,
      });
      setProjectName(imported.name);
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : "ZIP import failed.");
    }
    e.target.value = "";
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

    const uploaded = await Promise.all(assetFiles.map(readFileAsDataUrl));
    const updated = await addPaperAssets(projectId, uploaded);
    if (updated.assets) setAssets(updated.assets);
    e.target.value = "";
  };

  const streamAiSteps = useMemo((): ChatAiStep[] => {
    const streaming = [...messages].reverse().find((m) => m.role === "assistant" && m.isStreaming);
    return streaming?.aiSteps ?? [];
  }, [messages]);

  const openChatPanel = useCallback(() => {
    setChatOpen(true);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setMobileChatOpen(true);
    }
  }, []);

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
    [openChatPanel],
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

  const handleClearChatSelectionContext = useCallback(() => {
    setChatSelectionContext(null);
    setChatComposerMode("normal");
    setSelection("");
  }, []);

  const handleAskArioFixCompile = useCallback(() => {
    if (!compileError) return;
    const line = parseCompileErrorLine(compileError);
    setChatComposerMode("quick-edit");
    setChatSelectionContext(null);
    setSelection("");
    setChatInput(`Fix this LaTeX compile error:\n\n${compileError.slice(0, 1500)}`);
    if (line) setHighlightLine(line);
    openChatPanel();
  }, [compileError, openChatPanel]);

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

  const handleStopChat = useCallback(() => {
    if (!chatAbortRef.current) return;
    chatAbortRef.current.abort();
    setChatLoading(false);
    setLiveActivity(null);
    setMessages((prev) => {
      const idx = prev.findLastIndex((m) => m.role === "assistant" && m.isStreaming);
      if (idx === -1) return prev;
      const next = [...prev];
      const msg = next[idx] as ChatMessage;
      next[idx] = {
        ...msg,
        isStreaming: false,
        content: msg.content.trim() || "Đã dừng xử lý.",
      };
      return next;
    });
  }, []);

  const handleSend = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading || !projectId) return;
    const activeSelection = chatSelectionContext?.text ?? selection;
    const sentSelection = chatSelectionContext;
    const task = chatComposerMode === "quick-edit" ? ("edit" as const) : undefined;
    openChatPanel();
    chatAbortRef.current?.abort();
    const abort = new AbortController();
    chatAbortRef.current = abort;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      {
        role: "assistant",
        content: "",
        activities: [],
        aiSteps: [],
        reasoning: "",
        isStreaming: true,
      },
    ]);
    setChatInput("");
    setChatComposerMode("normal");
    setChatLoading(true);
    setLiveActivity(null);
    setPendingSuggestion(null);
    setPendingEdits(null);
    setActiveEditId(null);

    const patchAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findLastIndex((m) => m.role === "assistant" && m.isStreaming);
        if (idx === -1) return prev;
        next[idx] = updater(next[idx] as ChatMessage);
        return next;
      });
    };

    const pushStream = (fn: () => void) => {
      flushSync(fn);
    };

    try {
      await streamChat(
        text,
        {
          sessionId: projectId,
          latexContent: latex,
          selection: activeSelection,
          task,
          llm_provider: llmProvider,
          llm_model: llmModel || undefined,
          integrity_strictness: integrityStrictness,
        },
        {
          onActivity: (activityText) => {
            pushStream(() => {
              setLiveActivity(activityText);
              patchAssistant((msg) => {
                const activities = [...(msg.activities ?? [])];
                if (activities[activities.length - 1] !== activityText) {
                  activities.push(activityText);
                }
                return { ...msg, activities };
              });
            });
          },
          onState: (state: ChatAiStatePayload) => {
            const activityText = state.detail
              ? `${state.label} — ${state.detail}`
              : state.label;
            pushStream(() => {
              setLiveActivity(activityText);
              patchAssistant((msg) => ({
                ...msg,
                aiSteps: applyAiState(msg.aiSteps ?? [], state),
              }));
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
            const edits = (result.edits ?? []).filter(
              (e) => e?.replacement_text && e?.original_text,
            );
            const selectionAnchor =
              sentSelection &&
              sentSelection.end > sentSelection.start
                ? sentSelection
                : null;
            if (edits.length > 0) {
              const mapped: PendingEdit[] = edits.map((e) => ({
                id: e.id,
                file: e.file || "main.tex",
                section: e.section,
                applyMode: selectionAnchor
                  ? "selection"
                  : ((e.apply_mode ?? result.apply_mode ?? "selection") as
                      | "selection"
                      | "document"),
                originalText: selectionAnchor?.text ?? e.original_text,
                replacementText: selectionAnchor
                  ? clampSelectionReplacement(selectionAnchor.text, e.replacement_text)
                  : e.replacement_text,
                description: e.description,
                flags: result.integrity_flags ?? [],
                revisionId: result.revision_id || undefined,
                accepted: false,
                selectionStart: selectionAnchor?.start,
                selectionEnd: selectionAnchor?.end,
              }));
              setPendingEdits(mapped);
              setActiveEditId(mapped[0]?.id ?? null);
              setChatOpen(false);
            } else if (result.suggestion && result.original_text) {
              setPendingSuggestion({
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
              });
              setChatOpen(false);
            }
            if (result.citation_results?.length) {
              setCitationResults(result.citation_results);
              setCitationSummary(result.response || result.analysis || "");
            }
            if (result.revision_id) {
              void refreshRevisions();
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
      setMessages((prev) => {
        const idx = prev.findLastIndex((m) => m.role === "assistant" && m.isStreaming);
        if (idx === -1) return prev;
        const next = [...prev];
        const msg = next[idx] as ChatMessage;
        if (abort.signal.aborted) {
          next[idx] = {
            ...msg,
            isStreaming: false,
            content: msg.content.trim() || "Đã dừng xử lý.",
          };
          return next;
        }
        next[idx] = {
          ...msg,
          isStreaming: false,
          content:
            msg.content.trim() ||
            "Không nhận được phản hồi từ trợ lý. Vui lòng thử lại.",
        };
        return next;
      });
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleAcceptSuggestion = () => {
    if (!pendingSuggestion) return;
    const { originalText, suggestion, applyMode, revisionId, selectionStart, selectionEnd } =
      pendingSuggestion;
    let next = latex;
    if (applyMode === "document") {
      next = suggestion;
    } else if (
      selectionStart != null &&
      selectionEnd != null &&
      selectionEnd > selectionStart &&
      selectionEnd <= latex.length
    ) {
      const originalSlice = latex.slice(selectionStart, selectionEnd);
      next =
        latex.slice(0, selectionStart) +
        clampSelectionReplacement(originalSlice, suggestion) +
        latex.slice(selectionEnd);
    } else if (latex.includes(originalText)) {
      next = latex.replace(originalText, suggestion);
    } else {
      next = suggestion;
    }
    recordNow(next);
    setPendingSuggestion(null);
    if (projectId && revisionId) {
      void revisionAction(projectId, revisionId, "accepted")
        .then(() => refreshRevisions())
        .catch(() => {});
    }
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
    const revisionId = pendingSuggestion?.revisionId;
    setPendingSuggestion(null);
    if (projectId && revisionId) {
      void revisionAction(projectId, revisionId, "rejected")
        .then(() => refreshRevisions())
        .catch(() => {});
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Đã từ chối gợi ý. Bản thảo gốc không thay đổi." },
    ]);
  };

  const applySingleEdit = useCallback((base: string, edit: PendingEdit): string => {
    if (edit.applyMode === "document") return edit.replacementText;
    if (
      edit.selectionStart != null &&
      edit.selectionEnd != null &&
      edit.selectionEnd > edit.selectionStart &&
      edit.selectionEnd <= base.length
    ) {
      const originalSlice = base.slice(edit.selectionStart, edit.selectionEnd);
      const replacement = clampSelectionReplacement(originalSlice, edit.replacementText);
      return base.slice(0, edit.selectionStart) + replacement + base.slice(edit.selectionEnd);
    }
    if (base.includes(edit.originalText)) {
      return base.replace(edit.originalText, edit.replacementText);
    }
    return base;
  }, []);

  const handleAcceptEdit = useCallback(
    (editId: string) => {
      if (!pendingEdits) return;
      const edit = pendingEdits.find((e) => e.id === editId);
      if (!edit) return;
      const nextLatex = applySingleEdit(latex, edit);
      if (nextLatex !== latex) {
        recordNow(nextLatex);
      }
      const remaining = pendingEdits.filter((e) => e.id !== editId);
      setPendingEdits(remaining.length ? remaining : null);
      setActiveEditId(remaining[0]?.id ?? null);
      if (projectId && edit.revisionId) {
        void revisionAction(projectId, edit.revisionId, "accepted")
          .then(() => refreshRevisions())
          .catch(() => {});
      }
      if (autoCompile) {
        void handleCompile(nextLatex);
      }
    },
    [pendingEdits, latex, projectId, autoCompile, applySingleEdit, recordNow, refreshRevisions, handleCompile],
  );

  const handleRejectEdit = useCallback(
    (editId: string) => {
      if (!pendingEdits) return;
      const edit = pendingEdits.find((e) => e.id === editId);
      const remaining = pendingEdits.filter((e) => e.id !== editId);
      setPendingEdits(remaining.length ? remaining : null);
      setActiveEditId(remaining[0]?.id ?? null);
      if (projectId && edit?.revisionId) {
        void revisionAction(projectId, edit.revisionId, "rejected")
          .then(() => refreshRevisions())
          .catch(() => {});
      }
    },
    [pendingEdits, projectId, refreshRevisions],
  );

  const handleAcceptAllEdits = useCallback(() => {
    if (!pendingEdits?.length) return;
    let nextLatex = latex;
    for (const edit of pendingEdits) {
      nextLatex = applySingleEdit(nextLatex, edit);
    }
    if (nextLatex !== latex) {
      recordNow(nextLatex);
      if (autoCompile) void handleCompile(nextLatex);
    }
    setPendingEdits(null);
    setActiveEditId(null);
  }, [pendingEdits, latex, applySingleEdit, recordNow, autoCompile, handleCompile]);

  const handleRejectAllEdits = useCallback(() => {
    setPendingEdits(null);
    setActiveEditId(null);
  }, []);

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
  }, [pendingSuggestion]);

  const chatProps = {
    messages,
    chatInput,
    onChatInputChange: setChatInput,
    onSend: handleSend,
    onStop: handleStopChat,
    chatEndRef,
    chatLoading,
    liveActivity,
    streamAiSteps,
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
    isDirty,
  };

  return (
    <div className="editor-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
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
          label={bootState === "loading" ? "Loading project…" : "Opening editor…"}
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
          onSelectFile={switchActiveFile}
          onUpload={() => fileInputRef.current?.click()}
          onUploadZip={() => zipInputRef.current?.click()}
          onUploadAsset={() => assetInputRef.current?.click()}
          isDirty={isDirty}
        />
        <EditorDesktopPanels
          center={
            <CenterPanel
              latex={latex}
              activeFile={activeFile}
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
              pendingEdits={pendingEdits}
              activeEditId={activeEditId}
              onSelectEdit={setActiveEditId}
              onAcceptEdit={handleAcceptEdit}
              onRejectEdit={handleRejectEdit}
              onAcceptAllEdits={handleAcceptAllEdits}
              onRejectAllEdits={handleRejectAllEdits}
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
                revisions={revisionHistory}
                citationResults={citationResults}
                citationSummary={citationSummary}
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
                onAskArioFix={handleAskArioFixCompile}
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
            assets={assets}
            onSelectFile={switchActiveFile}
            onUpload={() => fileInputRef.current?.click()}
            onUploadZip={() => zipInputRef.current?.click()}
            isDirty={isDirty}
          />
        )}
        {mobileTab === "editor" && (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
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
            onAskArioFix={handleAskArioFixCompile}
            projectName={projectName}
            latexSource={mainLatexSource}
            mobile
          />
        )}
      </div>

      <MobileBottomBar activeFile={activeFile} onOpenChat={() => setMobileChatOpen(true)} isDirty={isDirty} />
      {mobileChatOpen && (
        <MobileChatSheet onClose={() => setMobileChatOpen(false)} {...chatProps} />
      )}

      <StatusBar lineCount={latex.split("\n").length} className="hidden md:flex" />
        </div>
      )}
    </div>
  );
}

function ArionearMasthead({
  className = "",
  integrityStrictness = "standard",
}: {
  className?: string;
  integrityStrictness?: ResearcherProfile["integrity_strictness"];
}) {
  const user = getSession();
  const integrityLabel =
    integrityStrictness === "strict"
      ? "Strict"
      : integrityStrictness === "relaxed"
        ? "Relaxed"
        : "On";

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
        <Link to="/profile" className="hover:text-[color:var(--editorial-red)] transition-colors">
          Profile
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
        <span className="text-[color:var(--editorial-red)]">
          Integrity Guard · {integrityLabel}
        </span>
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
      {SHOW_EDITOR_IMPORT ? (
        <button
          onClick={onUpload}
          className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background shadow-sm transition hover:opacity-90"
        >
          Upload
        </button>
      ) : (
        <div className="w-16 shrink-0" aria-hidden />
      )}
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

function MobileBottomBar({
  activeFile,
  onOpenChat,
  isDirty = false,
}: {
  activeFile: string;
  onOpenChat: () => void;
  isDirty?: boolean;
}) {
  return (
    <div className="flex md:hidden shrink-0 items-center justify-between border-t border-border/50 bg-card/95 px-3 py-2.5 backdrop-blur-sm safe-area-pb">
      <button className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm font-medium transition hover:bg-secondary">
        <FileText className="h-4 w-4 text-primary" />
        <span className="max-w-[8rem] truncate">{activeFile}</span>
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

function MobileFilesPanel({
  projectName,
  outlineLatex,
  highlightLine = null,
  onRenameProject,
  onOutlineJump,
  files,
  activeFile,
  assets,
  onSelectFile,
  onUpload,
  onUploadZip,
  isDirty = false,
}: {
  projectName: string;
  outlineLatex: string;
  highlightLine?: number | null;
  onRenameProject: (name: string) => void | Promise<void>;
  onOutlineJump?: (line: number) => void;
  files: ProjectFile[];
  activeFile: string;
  assets: ProjectAsset[];
  onSelectFile: (path: string) => void;
  onUpload: () => void;
  onUploadZip: () => void;
  isDirty?: boolean;
}) {
  return (
    <div className="soft-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar">
      <div className="border-b border-border/40 p-4">
        <EditableProjectName name={projectName} onRename={onRenameProject} />
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Files</span>
        <div className="flex gap-1">
          <IconBtn sm>
            <Search className="h-3.5 w-3.5" />
          </IconBtn>
          {SHOW_EDITOR_IMPORT && (
            <IconBtn sm onClick={onUpload}>
              <Plus className="h-3.5 w-3.5" />
            </IconBtn>
          )}
        </div>
      </div>

      <div className="px-3">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => onSelectFile(file.path)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition ${
              file.path === activeFile ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/50"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 truncate">{file.path}</span>
            {file.path === activeFile && isDirty && <span className="file-dirty-mark">*</span>}
          </button>
        ))}
        {assets.map((asset) => (
          <div key={asset.name} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{asset.name}</span>
          </div>
        ))}
      </div>

      {SHOW_EDITOR_IMPORT && (
        <div className="mt-4 space-y-2 px-4">
          <button
            type="button"
            onClick={onUploadZip}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 py-3 text-sm text-primary transition hover:border-primary"
          >
            <Upload className="h-4 w-4" />
            Import Overleaf ZIP
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground"
          >
            <Upload className="h-4 w-4" />
            Upload .tex file
          </button>
        </div>
      )}

      <div className="mt-6 border-t border-border/40 px-4 py-4">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Outline</span>
        <div className="mt-3">
          <LatexOutlineNav
            latex={outlineLatex}
            activeLine={highlightLine}
            onJumpToLine={onOutlineJump}
          />
        </div>
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
  onStop,
  chatEndRef,
  chatLoading,
  liveActivity,
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onRefreshProviders,
  chatComposerMode = "normal",
  chatSelectionContext = null,
  onClearChatSelectionContext,
}: {
  onClose: () => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  liveActivity?: string | null;
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onRefreshProviders?: () => void;
  chatComposerMode?: "normal" | "quick-edit";
  chatSelectionContext?: EditorSelectionContext | null;
  onClearChatSelectionContext?: () => void;
}) {
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const canUseLlm = Boolean(
    providers && providers.length > 0 && llmProvider && llmModel && onProviderChange && onModelChange,
  );

  useEffect(() => {
    if (chatComposerMode !== "quick-edit") return;
    const frame = requestAnimationFrame(() => chatInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [chatComposerMode, chatSelectionContext?.start]);

  const placeholder = !canUseLlm
    ? "Cấu hình OPENROUTER_API_KEY trong .env để chat"
    : chatComposerMode === "quick-edit"
      ? "Mô tả cách sửa đoạn đã chọn…"
      : chatSelectionContext
        ? "Hỏi về vùng đã chọn…"
        : "Ask anything";

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
          {chatComposerMode === "quick-edit" && (
            <div className="chat-quick-edit-banner mb-2" role="status">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Quick Edit — chỉnh sửa vùng đã chọn</span>
            </div>
          )}
          {chatSelectionContext && (
            <div className="chat-selection-chip mb-2">
              <span className="chat-selection-chip-label">
                {chatSelectionContext.lineStart === chatSelectionContext.lineEnd
                  ? `Dòng ${chatSelectionContext.lineStart}`
                  : `Dòng ${chatSelectionContext.lineStart}–${chatSelectionContext.lineEnd}`}
                <span className="chat-selection-chip-preview">
                  {chatSelectionContext.text.trim().slice(0, 72)}
                  {chatSelectionContext.text.trim().length > 72 ? "…" : ""}
                </span>
              </span>
              {onClearChatSelectionContext && (
                <button
                  type="button"
                  className="chat-selection-chip-clear"
                  onClick={onClearChatSelectionContext}
                  aria-label="Bỏ vùng chọn"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="chat-dock-llm-bar mb-2">
            {canUseLlm ? (
              <LlmSelector
                providers={providers!}
                llmProvider={llmProvider!}
                llmModel={llmModel!}
                onProviderChange={onProviderChange!}
                onModelChange={onModelChange!}
                onRefresh={onRefreshProviders}
                compact
                variant="light"
              />
            ) : (
              <p className="chat-dock-llm-hint">
                Chưa có provider LLM — thêm <code>OPENROUTER_API_KEY</code> vào <code>.env</code>.
              </p>
            )}
          </div>
          <ChatInput
            ref={chatInputRef}
            chatInput={chatInput}
            onChatInputChange={onChatInputChange}
            onSend={onSend}
            onStop={onStop}
            disabled={!canUseLlm}
            loading={chatLoading}
            placeholder={placeholder}
          />
        </div>
      </div>
    </div>
  );
}

function LeftSidebar({
  projectName,
  outlineLatex,
  highlightLine = null,
  onRenameProject,
  onOutlineJump,
  files,
  activeFile,
  mainFile,
  assets,
  tab,
  onTabChange,
  onSelectFile,
  onUpload,
  onUploadZip,
  onUploadAsset,
  isDirty = false,
}: {
  projectName: string;
  outlineLatex: string;
  highlightLine?: number | null;
  onRenameProject: (name: string) => void | Promise<void>;
  onOutlineJump?: (line: number) => void;
  files: ProjectFile[];
  activeFile: string;
  mainFile: string;
  assets: ProjectAsset[];
  tab: "files" | "chats";
  onTabChange: (t: "files" | "chats") => void;
  onSelectFile: (path: string) => void;
  onUpload: () => void;
  onUploadZip: () => void;
  onUploadAsset: () => void;
  isDirty?: boolean;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border/60 bg-sidebar/90 lg:w-60">
      <div className="border-b border-border p-3">
        <EditableProjectName name={projectName} onRename={onRenameProject} />
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
              {SHOW_EDITOR_IMPORT && (
                <IconBtn sm onClick={onUpload}>
                  <Plus className="h-3.5 w-3.5" />
                </IconBtn>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => onSelectFile(file.path)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                  file.path === activeFile
                    ? "bg-sidebar-accent font-medium"
                    : "text-foreground/80 hover:bg-sidebar-accent/50"
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate flex-1">{file.path}</span>
                {file.path === mainFile && (
                  <span className="rounded bg-primary/10 px-1 text-[9px] text-primary">main</span>
                )}
                {file.path === activeFile && isDirty && <span className="file-dirty-mark">*</span>}
              </button>
            ))}
            {assets.map((asset) => (
              <button
                key={asset.name}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground/70 transition hover:bg-sidebar-accent/50"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{asset.name}</span>
              </button>
            ))}
          </div>

          {SHOW_EDITOR_IMPORT && (
            <div className="space-y-2 border-t border-border p-3">
              <button
                type="button"
                onClick={onUploadZip}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-xs text-primary transition hover:border-primary"
              >
                <Upload className="h-3.5 w-3.5" />
                Import Overleaf ZIP
              </button>
              <button
                type="button"
                onClick={onUpload}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/50 px-3 py-2.5 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload .tex (+ assets)
              </button>
              <button
                onClick={onUploadAsset}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload figure files
              </button>
            </div>
          )}

          <div className="border-t border-border p-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Outline</span>
            <div className="mt-2">
              <LatexOutlineNav
                latex={outlineLatex}
                activeLine={highlightLine}
                onJumpToLine={onOutlineJump}
                compact
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-3">
          {["Edit Introduction", "Citation format APA", "Improve abstract"].map((label, i) => (
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
  onSelectionContextChange,
  onQuickEditRequest,
  fullHeight = false,
  highlightLine = null,
  synctexHighlight = null,
  inlineSuggestion = null,
  editorRef,
}: {
  latex: string;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  onSelectionContextChange?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor } | null,
  ) => void;
  onQuickEditRequest?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor },
  ) => void;
  fullHeight?: boolean;
  highlightLine?: number | null;
  synctexHighlight?: SynctexWordHighlight | null;
  inlineSuggestion?: PendingSuggestion | null;
  editorRef?: React.Ref<LatexCodeEditorHandle>;
}) {
  return (
    <LatexCodeEditor
      ref={editorRef}
      latex={latex}
      onLatexChange={onLatexChange}
      onSelectionChange={onSelectionChange}
      onSelectionContextChange={onSelectionContextChange}
      onQuickEditRequest={onQuickEditRequest}
      fullHeight={fullHeight}
      highlightLine={highlightLine}
      synctexHighlight={synctexHighlight}
      inlineSuggestion={
        inlineSuggestion
          ? {
              originalText: inlineSuggestion.originalText,
              suggestion: inlineSuggestion.suggestion,
              applyMode: inlineSuggestion.applyMode,
              selectionStart: inlineSuggestion.selectionStart,
              selectionEnd: inlineSuggestion.selectionEnd,
            }
          : null
      }
    />
  );
}

function CenterPanel({
  latex,
  activeFile,
  highlightLine = null,
  synctexHighlight = null,
  editorRef,
  onLatexChange,
  onSelectionChange,
  onSelectionContextChange,
  selectionPick,
  onAddSelectionToChat,
  onQuickEditSelection,
  onDismissSelectionToolbar,
  onQuickEditRequest,
  messages,
  chatInput,
  onChatInputChange,
  onSend,
  onStop,
  chatOpen,
  onCloseChat,
  onOpenChat,
  toolsOpen,
  onToggleTools,
  chatEndRef,
  chatLoading,
  liveActivity,
  streamAiSteps = [],
  providers,
  llmProvider,
  llmModel,
  onProviderChange,
  onModelChange,
  onRefreshProviders,
  pendingSuggestion,
  pendingEdits,
  activeEditId,
  onSelectEdit,
  onAcceptEdit,
  onRejectEdit,
  onAcceptAllEdits,
  onRejectAllEdits,
  onAcceptSuggestion,
  onRejectSuggestion,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isDirty = false,
  chatComposerMode = "normal",
  chatSelectionContext = null,
  onClearChatSelectionContext,
}: {
  latex: string;
  activeFile: string;
  highlightLine?: number | null;
  synctexHighlight?: SynctexWordHighlight | null;
  editorRef?: React.Ref<LatexCodeEditorHandle>;
  onLatexChange: (v: string) => void;
  onSelectionChange?: (v: string) => void;
  onSelectionContextChange?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor } | null,
  ) => void;
  selectionPick?: { context: EditorSelectionContext; anchor: SelectionAnchor } | null;
  onAddSelectionToChat?: () => void;
  onQuickEditSelection?: () => void;
  onDismissSelectionToolbar?: () => void;
  onQuickEditRequest?: (
    payload: { context: EditorSelectionContext; anchor: SelectionAnchor },
  ) => void;
  messages: ChatMessage[];
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  chatOpen: boolean;
  onCloseChat: () => void;
  onOpenChat: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatLoading?: boolean;
  liveActivity?: string | null;
  streamAiSteps?: ChatAiStep[];
  isDirty?: boolean;
  providers?: ProviderInfo[];
  llmProvider?: LLMProvider;
  llmModel?: string;
  onProviderChange?: (p: LLMProvider) => void;
  onModelChange?: (m: string) => void;
  onRefreshProviders?: () => void;
  pendingSuggestion?: PendingSuggestion | null;
  pendingEdits?: PendingEdit[] | null;
  activeEditId?: string | null;
  onSelectEdit?: (id: string) => void;
  onAcceptEdit?: (id: string) => void;
  onRejectEdit?: (id: string) => void;
  onAcceptAllEdits?: () => void;
  onRejectAllEdits?: () => void;
  onAcceptSuggestion?: () => void;
  onRejectSuggestion?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  chatComposerMode?: "normal" | "quick-edit";
  chatSelectionContext?: EditorSelectionContext | null;
  onClearChatSelectionContext?: () => void;
}) {
  return (
    <section className="editor-code-panel flex h-full min-h-0 flex-col overflow-hidden min-w-0">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2">
          <div className="editor-file-tab flex items-center gap-2 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
            <Avatar className="h-4 w-4 rounded-md">
              <AvatarImage src={arioAvatar} alt="" className="object-cover" />
              <AvatarFallback className="rounded-md text-[9px]">A</AvatarFallback>
            </Avatar>
            <span>{activeFile}</span>
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

      <div className="editor-workspace flex min-h-0 flex-1 flex-col overflow-hidden w-full">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden w-full min-w-0">
          <LatexEditor
            editorRef={editorRef}
            latex={latex}
            onLatexChange={onLatexChange}
            onSelectionChange={onSelectionChange}
            onSelectionContextChange={onSelectionContextChange}
            onQuickEditRequest={onQuickEditRequest}
            fullHeight
            highlightLine={highlightLine}
            synctexHighlight={synctexHighlight}
            inlineSuggestion={toInlineSuggestion(pendingEdits, activeEditId, pendingSuggestion)}
          />
          {selectionPick && onAddSelectionToChat && onQuickEditSelection && onDismissSelectionToolbar && (
            <EditorSelectionToolbar
              context={selectionPick.context}
              anchor={selectionPick.anchor}
              onAddToChat={onAddSelectionToChat}
              onQuickEdit={onQuickEditSelection}
              onDismiss={onDismissSelectionToolbar}
            />
          )}
        </div>

        {pendingEdits?.length ? (
          <div className="suggestion-panel shrink-0 border-t border-primary/15 bg-card/98 shadow-[0_-4px_20px_-8px_oklch(0.2_0.02_255_/_12%)] backdrop-blur-sm">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <span>Các thay đổi từ Ario ({pendingEdits.length})</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  Click để preview · Ctrl+Enter Accept · Esc Reject
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onRejectAllEdits}
                  className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-secondary"
                >
                  Reject all
                </button>
                <button
                  type="button"
                  onClick={onAcceptAllEdits}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90"
                >
                  Accept all
                </button>
              </div>
            </div>
            <div className="px-3 pb-2">
              <div className="flex flex-col gap-1">
                {pendingEdits.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelectEdit?.(e.id)}
                    className={`text-left rounded-md border px-2.5 py-2 text-xs transition ${
                      activeEditId === e.id
                        ? "border-primary/35 bg-primary/10"
                        : "border-border/60 hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {e.description || "Proposed change"}
                          {e.section ? ` · ${e.section}` : ""}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {e.file} · {e.applyMode}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            onRejectEdit?.(e.id);
                          }}
                          className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-secondary"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={(evt) => {
                            evt.stopPropagation();
                            onAcceptEdit?.(e.id);
                          }}
                          className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : pendingSuggestion && onAcceptSuggestion && onRejectSuggestion ? (
          <SuggestionPanel
            originalText={pendingSuggestion.originalText}
            suggestion={pendingSuggestion.suggestion}
            diff={pendingSuggestion.diff}
            flags={pendingSuggestion.flags}
            applyMode={pendingSuggestion.applyMode}
            onAccept={onAcceptSuggestion}
            onReject={onRejectSuggestion}
          />
        ) : null}

        <ChatOverlay
          open={chatOpen}
          onClose={onCloseChat}
          onOpen={onOpenChat}
          messages={messages}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          onSend={onSend}
          onStop={onStop}
          chatEndRef={chatEndRef}
          chatLoading={chatLoading}
          liveActivity={liveActivity}
          streamAiSteps={streamAiSteps}
          providers={providers}
          llmProvider={llmProvider}
          llmModel={llmModel}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onRefreshProviders={onRefreshProviders}
          composerMode={chatComposerMode}
          selectionContext={chatSelectionContext}
          onClearSelectionContext={onClearChatSelectionContext}
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
  revisions,
  citationResults: citationResultsProp,
  citationSummary: citationSummaryProp,
  onCitationsUpdated,
  onClose,
}: {
  latex: string;
  projectId: string;
  autoCompile: boolean;
  onAutoCompileChange: (enabled: boolean) => void;
  revisions: RevisionRecord[];
  citationResults: Record<string, unknown>[];
  citationSummary: string;
  onCitationsUpdated: (results: Record<string, unknown>[], summary: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ToolsTab>("info");
  const { theme, setTheme } = useTheme();
  const [citationResults, setCitationResults] = useState(citationResultsProp);
  const [citationSummary, setCitationSummary] = useState(citationSummaryProp);
  const [citationLoading, setCitationLoading] = useState(false);

  useEffect(() => {
    setCitationResults(citationResultsProp);
    setCitationSummary(citationSummaryProp);
  }, [citationResultsProp, citationSummaryProp]);

  const sortedRevisions = useMemo(
    () =>
      [...revisions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [revisions],
  );

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

  const handleVerifyCitations = async () => {
    if (!projectId) return;
    setCitationLoading(true);
    try {
      const result = await verifyCitations(projectId);
      setCitationResults(result.results);
      setCitationSummary(result.summary);
      onCitationsUpdated(result.results, result.summary);
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
                <span className="tools-setting-label">Researcher profile</span>
                <span className="tools-setting-hint">
                  AI defaults, citation style, auto-save, and affiliation
                </span>
              </div>
              <Link
                to="/profile"
                className="rounded-md border border-border/60 px-2.5 py-1 text-[11px] font-medium transition hover:bg-secondary"
              >
                Open
              </Link>
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
              <h2 className="tools-section-title mb-0">AI revision history</h2>
              <button
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Versions help"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Accept/Reject actions from Ario suggestions are recorded here (L4 audit trail).
            </p>

            {sortedRevisions.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                No AI revisions yet. Ask Ario to edit or polish your manuscript.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {sortedRevisions.map((rev, index) => {
                  const { additions, deletions } = countDiffStats(rev.original, rev.suggestion);
                  const ts = new Date(rev.created_at).getTime();
                  return (
                    <div key={rev.id} className="tools-version-entry flex-col items-stretch gap-2 !py-3">
                      <div className="flex items-center gap-2">
                        <span className="tools-version-pill">#{sortedRevisions.length - index}</span>
                        <span
                          className={`tools-version-pill ${
                            rev.action === "accepted"
                              ? "text-emerald-700"
                              : rev.action === "rejected"
                                ? "text-destructive"
                                : ""
                          }`}
                        >
                          {revisionActionLabel(rev.action)}
                        </span>
                        {rev.section && (
                          <span className="text-xs text-muted-foreground">{rev.section}</span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {!Number.isNaN(ts) ? formatTimeAgo(ts) : ""}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{rev.original}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="tools-diff">
                          <span className="text-emerald-600">+{additions}</span>
                          <span className="text-[color:var(--editorial-red)]">-{deletions}</span>
                        </span>
                        <span className="text-muted-foreground">chars vs original</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
