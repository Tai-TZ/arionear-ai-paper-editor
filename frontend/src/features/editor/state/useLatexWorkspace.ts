import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  compileLatex,
  type CompileMode,
} from "@/lib/api/academic";
import { buildCompileAssetHashes } from "@/lib/compile-asset-hash";
import { getCompilePayload, normalizeAssetName, type LatexCompiler, type ProjectAsset, type ProjectFile } from "@/lib/project-store";
import type { LatexCodeEditorHandle } from "@/components/latex-code-editor";
import { resolveSynctexWordHighlight, type SynctexWordHighlight } from "@/lib/synctex-highlight";
import { COMPILE_DEBOUNCE_MS, computeCompileFingerprint, isAgentFixableCompileError } from "../lib/editor-compile";
import { parseCompileErrorLine } from "../lib/editor-project-stats";

export type UseLatexWorkspaceOptions = {
  projectId: string | undefined;
  projectName: string;
  latex: string;
  projectFiles: ProjectFile[];
  activeFile: string;
  mainFile: string;
  compiler: LatexCompiler;
  assets: ProjectAsset[];
  persistActiveFile: (content: string, files: ProjectFile[], currentActive: string) => ProjectFile[];
  persistableFile: (files: ProjectFile[], currentActive: string) => string;
  switchActiveFile: (path: string) => void;
  latexEditorRef: React.RefObject<LatexCodeEditorHandle | null>;
  synctexHighlightMs: number;
  setMobileTab: React.Dispatch<React.SetStateAction<"editor" | "files" | "preview">>;
  compileAfterEditOk: string;
  compileAfterEditFail: string;
};

export function useLatexWorkspace({
  projectId,
  projectName,
  latex,
  projectFiles,
  activeFile,
  mainFile,
  compiler,
  assets,
  persistActiveFile,
  persistableFile,
  switchActiveFile,
  latexEditorRef,
  synctexHighlightMs,
  setMobileTab,
  compileAfterEditOk,
  compileAfterEditFail,
}: UseLatexWorkspaceOptions) {
  const [compileLog, setCompileLog] = useState<string | null>(null);
  const [synctexBase64, setSynctexBase64] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [synctexHighlight, setSynctexHighlight] = useState<SynctexWordHighlight | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileWarning, setCompileWarning] = useState<string | null>(null);

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

  const resetCompileCache = useCallback(() => {
    lastCompiledFingerprintRef.current = null;
    knownCompileAssetHashesRef.current = {};
    pendingCompileRef.current = null;
    if (compileDebounceRef.current) {
      clearTimeout(compileDebounceRef.current);
      compileDebounceRef.current = null;
    }
  }, []);

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
          toast.success(compileAfterEditOk);
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
            toast.success(compileAfterEditOk);
          } else {
            toast.error(compileAfterEditFail);
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
      compileAfterEditOk,
      compileAfterEditFail,
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
    resetCompileCache();
  }, [projectId, resetCompileCache]);

  useEffect(
    () => () => {
      if (compileDebounceRef.current) {
        clearTimeout(compileDebounceRef.current);
      }
    },
    [],
  );

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
    [latex, synctexHighlightMs, setMobileTab, latexEditorRef],
  );

  const jumpToOutlineLine = useCallback(
    (line: number) => {
      setMobileTab("editor");
      setHighlightLine(line);
      setSynctexHighlight(null);
      const scroll = () => latexEditorRef.current?.scrollToLine(line);
      requestAnimationFrame(scroll);
      window.setTimeout(scroll, 80);
    },
    [setMobileTab, latexEditorRef],
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

  const canAskArioFixCompile = Boolean(
    compileError && isAgentFixableCompileError(compileError),
  );

  const compileErrorLine = compileError ? parseCompileErrorLine(compileError) : null;

  return {
    compileLog,
    synctexBase64,
    pdfBase64,
    highlightLine,
    setHighlightLine,
    synctexHighlight,
    isCompiling,
    pdfData,
    compileError,
    compileWarning,
    executeCompile,
    markCompileAfterEdit,
    scheduleCompile,
    handleCompile,
    resetCompileCache,
    jumpToSynctex,
    jumpToOutlineLine,
    handleSynctexHit,
    canAskArioFixCompile,
    compileErrorLine,
  };
}
