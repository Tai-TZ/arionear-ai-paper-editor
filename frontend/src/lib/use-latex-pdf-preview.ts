import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectAsset } from "@/lib/project-store";
import {
  checkBusyTexAssets,
  compileLatexToPdf,
  revokePdfUrl,
  type LatexCompileResult,
} from "@/lib/latex-pdf-compile";

export type PdfPreviewState = {
  pdfUrl: string | null;
  isCompiling: boolean;
  isEngineReady: boolean | null;
  compileError: string | null;
  compileLog: string;
  compile: () => void;
};

export function useLatexPdfPreview(
  latex: string,
  assets: ProjectAsset[],
  autoCompileMs = 2000,
): PdfPreviewState {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState<boolean | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compileLog, setCompileLog] = useState("");
  const compileSeq = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latexRef = useRef(latex);
  const assetsRef = useRef(assets);

  latexRef.current = latex;
  assetsRef.current = assets;

  useEffect(() => {
    checkBusyTexAssets().then(setIsEngineReady);
  }, []);

  const runCompile = useCallback(async () => {
    const seq = ++compileSeq.current;
    setIsCompiling(true);
    setCompileError(null);

    const result: LatexCompileResult = await compileLatexToPdf(
      latexRef.current,
      assetsRef.current,
    );

    if (seq !== compileSeq.current) return;

    setIsCompiling(false);
    setCompileLog(result.log);

    if (result.success && result.pdfUrl) {
      setPdfUrl((prev) => {
        revokePdfUrl(prev);
        return result.pdfUrl;
      });
      setCompileError(null);
    } else {
      setCompileError(result.error ?? "Compilation failed");
    }
  }, []);

  const compile = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    void runCompile();
  }, [runCompile]);

  useEffect(() => {
    if (isEngineReady !== true) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runCompile();
    }, autoCompileMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [latex, assets, isEngineReady, autoCompileMs, runCompile]);

  useEffect(() => {
    return () => {
      compileSeq.current += 1;
      setPdfUrl((prev) => {
        revokePdfUrl(prev);
        return null;
      });
    };
  }, []);

  return {
    pdfUrl,
    isCompiling,
    isEngineReady,
    compileError,
    compileLog,
    compile,
  };
}
