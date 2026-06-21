import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppLoadingScreen } from "@/components/app-loading-screen";
import { LatexCodeEditor } from "@/components/latex-code-editor";
import { LatexOutlineNav } from "@/components/latex-outline-nav";
import { EditorDesktopPanels } from "@/components/editor-desktop-panels";
import { PdfPreviewPanel } from "@/components/pdf-preview-panel";
import { compileLatex } from "@/lib/api/academic";
import { fetchSharedPaper } from "@/lib/api/share-api";
import {
  getCompilePayload,
  type LatexCompiler,
  type ProjectAsset,
  type ProjectFile,
  normalizeProject,
  type StoredProject,
} from "@/lib/project-store";
import { useYjsShareViewer } from "@/lib/use-yjs-share-sync";

export const Route = createFileRoute("/share/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Shared manuscript — Arionear" }],
  }),
  component: ShareViewerPage,
});

function ShareViewerPage() {
  const { token } = Route.useParams();
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Shared manuscript");
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [activeFile, setActiveFile] = useState("main.tex");
  const [mainFile, setMainFile] = useState("main.tex");
  const [compiler, setCompiler] = useState<LatexCompiler>("auto");
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [latex, setLatex] = useState("");
  const [initialLatex, setInitialLatex] = useState("");
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [synctexBase64, setSynctexBase64] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileWarning, setCompileWarning] = useState<string | null>(null);
  const [compileLog, setCompileLog] = useState<string | null>(null);
  const compileTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setBootState("loading");
    setBootError(null);
    fetchSharedPaper(token)
      .then((paper) => {
        const metadata = paper.metadata ?? {};
        const normalized = normalizeProject({
          id: paper.id,
          name: paper.name,
          latex: paper.latex,
          files: Array.isArray(metadata.files) ? (metadata.files as ProjectFile[]) : undefined,
          mainFile: typeof metadata.mainFile === "string" ? metadata.mainFile : undefined,
          compiler:
            typeof metadata.compiler === "string"
              ? (metadata.compiler as LatexCompiler)
              : undefined,
          assets: Array.isArray(metadata.assets) ? (metadata.assets as ProjectAsset[]) : [],
          createdAt: Date.parse(paper.updated_at),
          updatedAt: Date.parse(paper.updated_at),
        } satisfies StoredProject);

        const main = normalized.mainFile ?? "main.tex";
        const files =
          normalized.files?.length > 0
            ? normalized.files
            : [{ path: main, content: normalized.latex }];
        const mainContent = files.find((f) => f.path === main)?.content ?? normalized.latex;

        setProjectName(normalized.name);
        setMainFile(main);
        setActiveFile(main);
        setCompiler(normalized.compiler ?? "auto");
        setProjectFiles(files);
        setAssets(normalized.assets ?? []);
        setLatex(mainContent);
        setInitialLatex(mainContent);
        setBootState("ready");
      })
      .catch((error: unknown) => {
        setBootError(error instanceof Error ? error.message : "Shared link not found.");
        setBootState("error");
      });
  }, [token]);

  const mainLatexSource = useMemo(
    () => projectFiles.find((f) => f.path === mainFile)?.content ?? latex,
    [projectFiles, mainFile, latex],
  );

  const handleRemoteLatex = useCallback(
    (next: string) => {
      setProjectFiles((prev) =>
        prev.map((file) => (file.path === mainFile ? { ...file, content: next } : file)),
      );
      if (activeFile === mainFile) {
        setLatex(next);
      }
    },
    [activeFile, mainFile],
  );

  useYjsShareViewer({
    token,
    initialLatex,
    onLatex: handleRemoteLatex,
  });

  const handleCompile = useCallback(async () => {
    setIsCompiling(true);
    setCompileError(null);
    setCompileWarning(null);
    setCompileLog(null);
    try {
      const payload = getCompilePayload({
        id: token,
        name: projectName,
        latex: mainLatexSource,
        files: projectFiles,
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
  }, [assets, compiler, mainFile, mainLatexSource, projectFiles, projectName, token]);

  useEffect(() => {
    if (bootState !== "ready" || !mainLatexSource.trim()) return;
    if (compileTimerRef.current) {
      window.clearTimeout(compileTimerRef.current);
    }
    compileTimerRef.current = window.setTimeout(() => {
      void handleCompile();
    }, 1200);
    return () => {
      if (compileTimerRef.current) {
        window.clearTimeout(compileTimerRef.current);
      }
    };
  }, [bootState, handleCompile, mainLatexSource]);

  const outlineLatex = mainLatexSource;

  if (bootState === "loading") {
    return <AppLoadingScreen label="Loading shared manuscript…" variant="fullscreen" />;
  }

  if (bootState === "error") {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="font-serif-display text-2xl font-bold">Link unavailable</p>
        <p className="max-w-md text-sm text-muted-foreground">{bootError}</p>
        <Link to="/" className="text-sm underline underline-offset-4">
          Back to Arionear
        </Link>
      </div>
    );
  }

  return (
    <div className="editor-shell flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="editor-masthead flex shrink-0 items-center justify-between border-b border-foreground/20 bg-foreground px-4 py-1 text-[10px] font-mono-data uppercase tracking-widest text-background">
        <div className="flex items-center gap-3">
          <Link to="/" className="hover:text-[color:var(--editorial-red)] transition-colors">
            Arionear
          </Link>
          <span className="opacity-40">·</span>
          <span>Shared view</span>
        </div>
        <span className="text-[color:var(--editorial-red)]">Read only</span>
      </div>

      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        <aside className="flex w-56 shrink-0 min-h-0 flex-col border-r border-border/60 bg-sidebar/90 lg:w-60">
          <div className="shrink-0 border-b border-border p-3">
            <p className="truncate font-serif-display text-base font-semibold">{projectName}</p>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              View only
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {projectFiles.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => {
                  setActiveFile(file.path);
                  setLatex(file.content);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                  file.path === activeFile
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{file.path}</span>
                {file.path === mainFile ? (
                  <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-mono uppercase text-primary">
                    main
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="shrink-0 border-t border-border p-2 max-h-[38%] overflow-y-auto">
            <LatexOutlineNav latex={outlineLatex} />
          </div>
        </aside>

        <EditorDesktopPanels
          center={
            <section className="editor-code-panel flex h-full min-h-0 flex-col overflow-hidden min-w-0">
              <div className="flex h-11 shrink-0 items-center border-b border-border/60 bg-card/80 px-4 backdrop-blur-sm">
                <div className="editor-file-tab flex items-center gap-2 rounded-lg border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
                  <span>{activeFile}</span>
                </div>
              </div>
              <div className="editor-workspace flex min-h-0 flex-1 flex-col overflow-hidden w-full">
                <LatexCodeEditor latex={latex} onLatexChange={() => {}} readOnly fullHeight />
              </div>
            </section>
          }
          right={
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
              onCompile={() => void handleCompile()}
              latexSource={mainLatexSource}
              projectName={projectName}
              readOnly
            />
          }
        />
      </div>

      <div className="flex md:hidden flex-1 min-h-0 flex-col overflow-hidden">
        <div className="border-b border-border px-3 py-2">
          <p className="truncate text-sm font-medium">{projectName}</p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <LatexCodeEditor latex={latex} onLatexChange={() => {}} readOnly fullHeight />
        </div>
      </div>
    </div>
  );
}
