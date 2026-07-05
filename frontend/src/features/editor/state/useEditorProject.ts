import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { NavigateOptions } from "@tanstack/react-router";
import { toast } from "sonner";

import { addPaperAssets, fetchPaper, updatePaper } from "@/lib/api/papers-api";
import { fetchDedupe, invalidateFetchKey } from "@/lib/api/fetch-dedupe";
import { syncSession, invalidateSessionSync, markSessionSynced } from "@/lib/api/academic";
import { editorCopy } from "@/lib/editor-i18n";
import { importOverleafZip } from "@/lib/overleaf-import";
import {
  importLatexFileList,
  mergeProjectAssets,
  mergeProjectFiles,
  type LatexImportResult,
} from "@/lib/latex-import";
import { fetchResearcherProfile } from "@/lib/api/profile-api";
import { getCachedProfile, type ResearcherProfile } from "@/lib/researcher-profile";
import type { PaperShareStatus } from "@/lib/api/share-api";
import { useYjsShareSync } from "@/lib/use-yjs-share-sync";
import { useLatexHistory } from "@/lib/use-latex-history";
import type { UiLanguage } from "@/lib/researcher-profile";
import {
  findProjectAsset,
  isBibFile,
  isImageAssetFile,
  isProjectAssetFile,
  normalizeAssetName,
  readFileAsDataUrl,
  type ChatThread,
  type LatexCompiler,
  type ProjectAsset,
  type ProjectFile,
} from "@/lib/project-store";
import type { LogicAuditReport } from "@/lib/api/academic";
import { logicAuditFingerprint } from "@/lib/paper-score-audit";

export type EditorProjectBootPayload = {
  chatThreads: ChatThread[];
  logicAuditReport: LogicAuditReport | null;
  gateAuditReport: LogicAuditReport | null;
  mainLatexFingerprint: string | null;
  gateAuditFingerprint: string | null;
};

export type UseEditorProjectOptions = {
  projectId: string | undefined;
  navigate: (opts: NavigateOptions) => void;
  locale: UiLanguage;
  onBootReady?: (payload: EditorProjectBootPayload) => void;
  onImportComplete?: () => void;
};

export function useEditorProject({
  projectId,
  navigate,
  locale,
  onBootReady,
  onImportComplete,
}: UseEditorProjectOptions) {
  const t = useMemo(() => editorCopy(locale), [locale]);

  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [splashPhase, setSplashPhase] = useState<"visible" | "exiting" | "hidden">("visible");
  const [projectName, setProjectName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [activeFile, setActiveFile] = useState("main.tex");
  const [mainFile, setMainFile] = useState("main.tex");
  const [compiler, setCompiler] = useState<LatexCompiler>("auto");
  const [savedLatex, setSavedLatex] = useState("");
  const [shareStatus, setShareStatus] = useState<PaperShareStatus | null>(null);
  const [autoCompile, setAutoCompile] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [synctexHighlightMs, setSynctexHighlightMs] = useState(5000);
  const [integrityStrictness, setIntegrityStrictness] =
    useState<ResearcherProfile["integrity_strictness"]>("standard");

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

  const isDirty = latex !== savedLatex;
  const mainLatexSource = useMemo(
    () => projectFiles.find((f) => f.path === mainFile)?.content ?? latex,
    [projectFiles, mainFile, latex],
  );

  const bootChatThreadsRef = useRef<ChatThread[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const showSplash = splashPhase !== "hidden";
  const showEditor = bootState === "ready";

  useEffect(() => {
    let cancelled = false;
    fetchResearcherProfile()
      .then((profile) => {
        if (cancelled) return;
        setAutoCompile(profile.auto_compile);
        setAutoSave(profile.auto_save);
        setSynctexHighlightMs(profile.synctex_highlight_ms);
        setIntegrityStrictness(profile.integrity_strictness);
      })
      .catch(() => {
        const cached = getCachedProfile();
        if (!cached || cancelled) return;
        setAutoCompile(cached.auto_compile);
        setAutoSave(cached.auto_save);
        setSynctexHighlightMs(cached.synctex_highlight_ms);
        setIntegrityStrictness(cached.integrity_strictness);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyBootProject = useCallback(
    (project: Awaited<ReturnType<typeof fetchPaper>>) => {
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
      bootChatThreadsRef.current = project.chatThreads ?? [];

      const panelFp = project.logicAuditReport?.sections?.length
        ? logicAuditFingerprint(project.latex)
        : null;
      const storedGateFp = project.gateAuditFingerprint ?? null;
      const currentFp = logicAuditFingerprint(project.latex);
      const gateFp =
        storedGateFp && storedGateFp === currentFp ? storedGateFp : null;
      const gateReportUsable =
        project.gateAuditReport?.sections?.length && gateFp
          ? project.gateAuditReport
          : null;

      onBootReady?.({
        chatThreads: bootChatThreadsRef.current,
        logicAuditReport: project.logicAuditReport?.sections?.length
          ? project.logicAuditReport
          : null,
        gateAuditReport: gateReportUsable,
        mainLatexFingerprint: panelFp,
        gateAuditFingerprint: gateFp,
      });

      // Server already has this latex from GET /papers — skip redundant sync on boot.
      markSessionSynced(project.id, project.name, project.latex);

      setBootState("ready");
    },
    [onBootReady, resetHistory],
  );

  useEffect(() => {
    if (!projectId) {
      navigate({ to: "/projects", replace: true });
      return;
    }
    let cancelled = false;
    setBootState("loading");
    setBootError(null);
    setSplashPhase("visible");
    setShareStatus(null);

    fetchPaper(projectId)
      .then((project) => {
        if (cancelled) return;
        applyBootProject(project);
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
  }, [projectId, navigate, applyBootProject]);

  useEffect(() => {
    if (projectId) invalidateSessionSync(projectId);
  }, [projectId]);

  useEffect(() => {
    if (bootState !== "ready") return;
    const exitTimer = window.setTimeout(() => setSplashPhase("exiting"), 160);
    const hideTimer = window.setTimeout(() => setSplashPhase("hidden"), 560);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(hideTimer);
    };
  }, [bootState]);

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

  const persistableFile = useCallback(
    (files: ProjectFile[], currentActive: string) =>
      files.some((f) => f.path === currentActive) ? currentActive : mainFile,
    [mainFile],
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

      if (content === undefined && isBibFile(nextPath)) {
        const bibAsset = assets.find((a) => normalizeAssetName(a.name) === nextPath);
        if (bibAsset?.dataUrl?.startsWith("data:")) {
          try {
            const base64 = bibAsset.dataUrl.split(",")[1] ?? "";
            content = atob(base64);
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
    },
    [switchActiveFile],
  );

  const activeAsset = useMemo(
    () => (isImageAssetFile(activeFile) ? findProjectAsset(activeFile, assets) : null),
    [activeFile, assets],
  );
  const viewingAsset = isImageAssetFile(activeFile);

  const persistProjectFiles = useCallback(
    (options?: { immediate?: boolean }) => {
      if (!projectId) return;
      const activePath = persistableFile(projectFiles, activeFile);
      const files = persistActiveFile(latex, projectFiles, activePath);
      setProjectFiles(files);
      const mainContent = files.find((f) => f.path === mainFile)?.content ?? latex;
      const changedFile = files.find((f) => f.path === activePath);
      updatePaper(
        projectId,
        {
          latex: mainContent,
          ...(changedFile ? { files: [changedFile] } : {}),
        },
        { immediate: options?.immediate ?? false },
      )
        .then(() => {
          setSavedLatex(latex);
        })
        .catch(() => {
          toast.error(t.errors.saveFailed);
        });
    },
    [
      projectId,
      latex,
      projectFiles,
      activeFile,
      mainFile,
      persistActiveFile,
      persistableFile,
      t.errors.saveFailed,
    ],
  );

  const saveProjectAfterEdit = useCallback(() => {
    if (!projectId || !autoSave) return;
    persistProjectFiles();
  }, [projectId, autoSave, persistProjectFiles]);

  const retryBootLoad = useCallback(() => {
    if (!projectId) return;
    setBootState("loading");
    setBootError(null);
    invalidateFetchKey(`papers:${projectId}`);
    fetchPaper(projectId)
      .then(applyBootProject)
      .catch((error: unknown) => {
        setBootError(
          error instanceof Error ? error.message : "Failed to load this project.",
        );
        setBootState("error");
      });
  }, [projectId, applyBootProject]);

  const handleRenameProject = useCallback(
    async (name: string) => {
      if (!projectId) return;
      setProjectName(name);
      await updatePaper(projectId, { name });
    },
    [projectId],
  );

  const applyImportedFiles = useCallback(
    async (imported: LatexImportResult, replaceProject = false) => {
      if (!projectId) return;

      const filesWithActive = persistActiveFile(latex, projectFiles, activeFile);
      const isLikelyBlank =
        projectFiles.length <= 1 &&
        (mainFile === "main.tex" || mainFile === activeFile) &&
        (latex.trim().length < 400 ||
          /\\title\{(?:Untitled(?: Manuscript)?|Bài báo chưa đặt tên)\}/.test(latex));

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
      void syncSession(projectId, nextName, mainContent);
      onImportComplete?.();
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
      onImportComplete,
    ],
  );

  const handleUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
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
          error instanceof Error
            ? error.message
            : locale === "vi"
              ? "Tải lên thất bại."
              : "Upload failed.",
        );
      } finally {
        setUploadStatus(null);
      }
    },
    [projectId, locale, applyImportedFiles],
  );

  const handleZipImport = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
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
          error instanceof Error
            ? error.message
            : locale === "vi"
              ? "Nhập ZIP thất bại."
              : "ZIP import failed.",
        );
      } finally {
        setUploadStatus(null);
      }
    },
    [projectId, locale, applyImportedFiles],
  );

  const handleAssetUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
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
          error instanceof Error
            ? error.message
            : locale === "vi"
              ? "Tải tài nguyên thất bại."
              : "Asset upload failed.",
        );
      } finally {
        setUploadStatus(null);
      }
      e.target.value = "";
    },
    [projectId, locale],
  );

  return {
    bootState,
    bootError,
    splashPhase,
    showSplash,
    showEditor,
    projectName,
    uploadStatus,
    assets,
    setAssets,
    projectFiles,
    setProjectFiles,
    activeFile,
    mainFile,
    compiler,
    setCompiler,
    savedLatex,
    isDirty,
    shareStatus,
    setShareStatus,
    autoCompile,
    setAutoCompile,
    autoSave,
    synctexHighlightMs,
    integrityStrictness,
    latex,
    setLatex,
    recordNow,
    undo,
    redo,
    canUndo,
    canRedo,
    mainLatexSource,
    bootChatThreadsRef,
    fileInputRef,
    folderInputRef,
    assetInputRef,
    zipInputRef,
    persistActiveFile,
    persistableFile,
    switchActiveFile,
    openProjectFile,
    activeAsset,
    viewingAsset,
    persistProjectFiles,
    saveProjectAfterEdit,
    retryBootLoad,
    handleRenameProject,
    handleUpload,
    handleZipImport,
    handleAssetUpload,
  };
}
