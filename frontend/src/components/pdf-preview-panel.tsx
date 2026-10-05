import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from "pdfjs-dist";
import { fetchCompileStatus, lookupSynctexInverse, type LatexCompiler } from "@/lib/api/academic";
import { unreachableServerMessage } from "@/lib/api/api-errors";
import { CompileLogPanel } from "@/components/compile-log-panel";
import {
  computeFitScale,
  collectPdfSearchMatches,
  extractPdfWordContext,
  findPageForQuery,
  loadPdfDocument,
  resolveSynctexPdfPoint,
  renderPageAnnotationLayer,
  renderPageTextLayer,
  renderPageToCanvas,
  type PdfPageRenderResult,
  type PdfSearchMatch,
} from "@/lib/pdf-renderer";
import { PdfLinkService } from "@/lib/pdf-link-service";
import { capturePdfClickWord } from "@/lib/synctex-highlight";
import { useLatestRef } from "@/lib/use-latest-ref";
import { useLocale } from "@/components/locale-context";
import { editorCopy } from "@/lib/editor-i18n";
import type { DefensePdfCitationFocus } from "@/lib/defense-pdf-links";
import {
  clearPdfHighlights,
  highlightPdfTextLayer,
  highlightPdfTextLayerOccurrence,
} from "@/lib/pdf-text-highlight";

const ZOOM_PRESETS = [50, 75, 100, 125, 150] as const;
type ZoomPreset = (typeof ZOOM_PRESETS)[number] | "fit";

type PdfPreviewPanelProps = {
  pdfData: Uint8Array | null;
  isCompiling: boolean;
  compileError: string | null;
  compileWarning?: string | null;
  compileLog?: string | null;
  synctexBase64?: string | null;
  pdfBase64?: string | null;
  mainFile?: string;
  compiler?: LatexCompiler;
  compilersAvailable?: Partial<Record<LatexCompiler, boolean>>;
  onCompilerChange?: (compiler: LatexCompiler) => void;
  onSynctexHit?: (
    file: string,
    line: number,
    word?: string,
    column?: number,
    context?: string,
  ) => void;
  onCompile: () => void;
  onAskArioFix?: () => void;
  mobile?: boolean;
  projectName?: string;
  latexSource?: string;
  /** Hide compile/tools; show PDF with zoom/navigation only (shared view). */
  readOnly?: boolean;
  /** Reuse backend compile workspace for SyncTeX (avoids re-uploading PDF blobs). */
  compileCacheId?: string;
  /** Scroll to and highlight a citation from defense chat links. */
  citationFocus?: DefensePdfCitationFocus | null;
  /** Called when a citation link could not be located in the PDF. */
  onCitationMiss?: () => void;
};

function IconBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="pdf-preview-icon-btn inline-flex h-7 w-7 items-center justify-center rounded transition disabled:opacity-40"
    >
      {children}
    </button>
  );
}

type PageSize = { width: number; height: number };

const sameSize = (a: PageSize | null, b: PageSize) =>
  a !== null && a.width === b.width && a.height === b.height;

/** Fit-to-width zoom snaps to 5% steps so small panel resizes do not re-render every page. */
const FIT_SCALE_STEPS_PER_UNIT = 20;
const FIT_SCALE_DEBOUNCE_MS = 150;

function roundFitScale(scale: number): number {
  return Math.round(scale * FIT_SCALE_STEPS_PER_UNIT) / FIT_SCALE_STEPS_PER_UNIT;
}

/**
 * One PDF page. Kept mounted across zoom changes and recompiles (keyed by page number): the
 * canvas and text/annotation layers are re-rendered in place, cancelling any in-flight render.
 */
const PdfPageView = memo(function PdfPageView({
  pdf,
  pageNumber,
  scale,
  linkService,
  onVisible,
  onPageClick,
  onPageNotReady,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  linkService: PdfLinkService;
  onVisible: (pageNumber: number) => void;
  onPageClick?: (pageNumber: number, x: number, y: number, word?: string, context?: string) => void;
  onPageNotReady?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [pageViewport, setPageViewport] = useState<PageViewport | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const renderTokenRef = useRef(0);

  const activeViewport = useCallback((): PageViewport | null => {
    return viewportRef.current ?? pageViewport ?? pageRef.current?.getViewport({ scale }) ?? null;
  }, [pageViewport, scale]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.35) {
            onVisible(pageNumber);
          }
        }
      },
      { threshold: [0.35, 0.55, 0.75] },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, pageNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    const annotationLayer = annotationLayerRef.current;
    if (!canvas || !textLayer || !annotationLayer) return;

    const token = ++renderTokenRef.current;
    let cancelled = false;
    const controller = new AbortController();
    const { signal } = controller;
    // The page proxy may belong to a document that was just replaced (and destroyed); until this
    // render resolves the new one, SyncTeX clicks fall back to `pdf.getPage`.
    pageRef.current = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || token !== renderTokenRef.current) return;
        pageRef.current = page;

        // Size the sheet for the new scale right away so the layout does not jump mid-render.
        const target = page.getViewport({ scale });
        const targetSize = { width: target.width, height: target.height };
        setDimensions((prev) => (sameSize(prev, targetSize) ? prev : targetSize));

        const rendered: PdfPageRenderResult = await renderPageToCanvas(page, canvas, scale, signal);
        if (cancelled || token !== renderTokenRef.current) return;

        viewportRef.current = rendered.viewport;
        const renderedSize = { width: rendered.width, height: rendered.height };
        setDimensions((prev) => (sameSize(prev, renderedSize) ? prev : renderedSize));
        setPageViewport(rendered.viewport);

        try {
          await renderPageTextLayer(page, textLayer, rendered.viewport, signal);
        } catch {
          /* SyncTeX still works via canvas + text-content fallback */
        }
        if (cancelled || token !== renderTokenRef.current) return;

        try {
          await renderPageAnnotationLayer(
            page,
            annotationLayer,
            rendered.viewport,
            linkService,
            signal,
          );
        } catch {
          /* citation links are optional */
        }
      } catch {
        // Includes RenderingCancelledException from a superseded render (cancelled === true).
        if (!cancelled) {
          viewportRef.current = null;
          pageRef.current = null;
          setDimensions(null);
          setPageViewport(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pdf, pageNumber, scale, linkService]);

  return (
    <div
      ref={rootRef}
      data-page={pageNumber}
      className="pdf-preview-page-sheet"
      onDoubleClick={(e) => {
        if (!onPageClick || !canvasRef.current) return;
        const viewport = activeViewport();
        if (!viewport) {
          onPageNotReady?.();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const rect = canvasRef.current.getBoundingClientRect();
        const { clientX, clientY } = e;
        const textLayer = textLayerRef.current;
        void capturePdfClickWord(clientX, clientY, textLayer).then(async (word) => {
          window.getSelection()?.removeAllRanges();
          let context = "";
          let pdfX = 0;
          let pdfY = 0;
          const page = pageRef.current ?? (await pdf.getPage(pageNumber));
          pageRef.current = page;
          [pdfX, pdfY] = await resolveSynctexPdfPoint(
            page,
            viewport,
            rect,
            clientX,
            clientY,
            textLayer,
            word,
          );
          const ctx = await extractPdfWordContext(page, pdfX, pdfY, word);
          if (ctx?.word && !word) word = ctx.word;
          context = ctx?.context ?? "";
          onPageClick(pageNumber, pdfX, pdfY, word, context);
        });
      }}
      style={
        dimensions
          ? { width: dimensions.width, minHeight: dimensions.height }
          : { width: 612 * scale, minHeight: 792 * scale }
      }
    >
      <div
        className="pdf-preview-page-inner"
        style={dimensions ? { width: dimensions.width, height: dimensions.height } : undefined}
      >
        <canvas ref={canvasRef} className="pdf-preview-canvas" />
        <div ref={textLayerRef} className="textLayer pdf-preview-text-layer" />
        <div ref={annotationLayerRef} className="pdf-preview-annotation-layer" />
      </div>
    </div>
  );
});

export const PdfPreviewPanel = memo(function PdfPreviewPanel({
  pdfData,
  isCompiling,
  compileError,
  compileWarning = null,
  compileLog = null,
  synctexBase64 = null,
  pdfBase64 = null,
  mainFile = "main.tex",
  compiler = "auto",
  compilersAvailable,
  onCompilerChange,
  onSynctexHit,
  onCompile,
  onAskArioFix,
  mobile = false,
  projectName = "document",
  latexSource = "",
  readOnly = false,
  citationFocus = null,
  onCitationMiss,
  compileCacheId,
}: PdfPreviewPanelProps) {
  const { locale } = useLocale();
  const t = useMemo(() => editorCopy(locale), [locale]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollToPageRef = useRef<(page: number) => void>(() => {});
  const linkService = useMemo(
    () => new PdfLinkService((page) => scrollToPageRef.current(page)),
    [],
  );

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomPreset>("fit");
  const [fitScale, setFitScale] = useState(1);
  const [basePageWidth, setBasePageWidth] = useState(612);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [searchMatches, setSearchMatches] = useState<PdfSearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  // Latest search request; a recompile can replace the document while an older search still runs.
  const searchSeqRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [enginesInfo, setEnginesInfo] = useState<Partial<Record<string, boolean>>>({});
  const [logOpen, setLogOpen] = useState(false);
  const [synctexHint, setSynctexHint] = useState<string | null>(null);
  const synctexBusyRef = useRef(false);

  const flashSynctexHint = useCallback((message: string, ms = 2800) => {
    setSynctexHint(message);
    window.setTimeout(() => setSynctexHint(null), ms);
  }, []);

  const effectiveScale = useMemo(() => {
    if (zoomMode === "fit") return fitScale;
    return zoomMode / 100;
  }, [fitScale, zoomMode]);

  const displayZoom = Math.round(effectiveScale * 100);

  const synctexEnabled =
    !readOnly && Boolean(onSynctexHit && (synctexBase64 || compileCacheId?.trim()));

  useEffect(() => {
    let cancelled = false;
    fetchCompileStatus()
      .then((status) => {
        if (cancelled) return;
        setEngineReady(status.available);
        const e = status.engines;
        if (e) {
          setEnginesInfo({
            pdflatex: Boolean(e.pdflatex),
            xelatex: Boolean(e.xelatex),
            lualatex: Boolean(e.lualatex),
            latex: Boolean(e.latex),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setEngineReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pdfData) {
      setPdf(null);
      setNumPages(0);
      setCurrentPage(1);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);

    loadPdfDocument(pdfData)
      .then(async (doc) => {
        if (cancelled) {
          // A newer compile (or unmount) superseded this load: free the worker-side document.
          void doc.destroy();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        const firstPage = await doc.getPage(1);
        setBasePageWidth(firstPage.getViewport({ scale: 1 }).width);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPdf(null);
        setNumPages(0);
        setLoadError(error instanceof Error ? error.message : "Failed to load PDF.");
      });

    return () => {
      cancelled = true;
    };
  }, [pdfData]);

  // Each compile loads a new document; destroy the previous one once it has been replaced (its
  // pages keep showing until the new render paints over them) and on unmount.
  useEffect(() => {
    if (!pdf) return;
    return () => {
      void pdf.destroy();
    };
  }, [pdf]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateFit = () => {
      setFitScale(roundFitScale(computeFitScale(el.clientWidth, basePageWidth)));
    };

    updateFit();
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(updateFit, FIT_SCALE_DEBOUNCE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [basePageWidth, pdf]);

  const scrollToPage = useCallback(
    (pageNumber: number) => {
      const clamped = Math.max(1, Math.min(pageNumber, numPages || 1));
      const node = viewportRef.current?.querySelector(`[data-page="${clamped}"]`);
      node?.scrollIntoView({ behavior: "smooth", block: "start" });
      linkService.setCurrentPage(clamped);
      setCurrentPage(clamped);
    },
    [linkService, numPages],
  );

  useEffect(() => {
    scrollToPageRef.current = scrollToPage;
  }, [scrollToPage]);

  useEffect(() => {
    linkService.setDocument(pdf);
  }, [linkService, pdf]);

  const handlePageVisible = useCallback(
    (pageNumber: number) => {
      linkService.setCurrentPage(pageNumber);
      setCurrentPage(pageNumber);
    },
    [linkService],
  );

  const handlePrevPage = () => scrollToPage(currentPage - 1);
  const handleNextPage = () => scrollToPage(currentPage + 1);

  const handleZoomIn = () => {
    const next = ZOOM_PRESETS.find((z) => z > displayZoom) ?? 150;
    setZoomMode(next);
  };

  const handleZoomOut = () => {
    const prev = [...ZOOM_PRESETS].reverse().find((z) => z < displayZoom) ?? 50;
    setZoomMode(prev);
  };

  const applySearchHighlight = useCallback(
    async (matchIndex: number, matches: PdfSearchMatch[], query: string) => {
      const match = matches[matchIndex];
      if (!match) return;

      scrollToPage(match.page);
      const viewport = viewportRef.current;
      if (!viewport) return;

      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        const layer = viewport.querySelector(`[data-page="${match.page}"] .pdf-preview-text-layer`);
        if (!(layer instanceof HTMLElement) || !layer.querySelector("span")) continue;

        clearPdfHighlights(viewport);
        const mark = highlightPdfTextLayerOccurrence(layer, query, match.occurrenceOnPage);
        if (mark) {
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
    },
    [scrollToPage],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchStatus(null);
    setSearchMatches([]);
    setActiveMatchIndex(-1);
    if (viewportRef.current) clearPdfHighlights(viewportRef.current);
  }, []);

  const goToMatch = useCallback(
    async (matchIndex: number, matches: PdfSearchMatch[], query: string) => {
      if (matchIndex < 0 || matchIndex >= matches.length) return;
      setActiveMatchIndex(matchIndex);
      setSearchStatus(t.pdf.searchMatchOf(matchIndex + 1, matches.length));
      await applySearchHighlight(matchIndex, matches, query);
    },
    [applySearchHighlight, t.pdf],
  );

  const runSearch = useCallback(
    async (query: string, preferredIndex = 0) => {
      const seq = ++searchSeqRef.current;
      if (!pdf || !query.trim()) {
        setSearchMatches([]);
        setActiveMatchIndex(-1);
        setSearchStatus(null);
        if (viewportRef.current) clearPdfHighlights(viewportRef.current);
        return;
      }

      setIsSearching(true);
      setSearchStatus(t.pdf.searching);
      try {
        let matches: PdfSearchMatch[];
        try {
          matches = await collectPdfSearchMatches(pdf, query);
        } catch {
          // The document was destroyed mid-search (newer compile); the effect searches the new one.
          if (seq === searchSeqRef.current) {
            setSearchMatches([]);
            setActiveMatchIndex(-1);
            setSearchStatus(null);
          }
          return;
        }
        if (seq !== searchSeqRef.current) return; // a newer search owns the results
        setSearchMatches(matches);
        if (!matches.length) {
          setActiveMatchIndex(-1);
          setSearchStatus(t.pdf.searchNoMatches);
          if (viewportRef.current) clearPdfHighlights(viewportRef.current);
          return;
        }
        const idx = Math.min(Math.max(0, preferredIndex), matches.length - 1);
        await goToMatch(idx, matches, query);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    },
    [goToMatch, pdf, t.pdf],
  );

  const handleSearchNext = () => {
    if (!searchMatches.length || !searchQuery.trim()) return;
    const next = activeMatchIndex < 0 ? 0 : (activeMatchIndex + 1) % searchMatches.length;
    void goToMatch(next, searchMatches, searchQuery);
  };

  const handleSearchPrev = () => {
    if (!searchMatches.length || !searchQuery.trim()) return;
    const prev = activeMatchIndex <= 0 ? searchMatches.length - 1 : activeMatchIndex - 1;
    void goToMatch(prev, searchMatches, searchQuery);
  };

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || !pdf) return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchMatches([]);
      setActiveMatchIndex(-1);
      setSearchStatus(null);
      if (viewportRef.current) clearPdfHighlights(viewportRef.current);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(query, 0);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery, pdf, runSearch]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!citationFocus || !pdf || !viewport) return;

    const queries = [citationFocus.search, ...(citationFocus.searchCandidates ?? [])]
      .map((q) => q.trim())
      .filter((q, i, arr) => q.length > 0 && arr.indexOf(q) === i);
    if (!queries.length) return;

    let cancelled = false;

    (async () => {
      clearPdfHighlights(viewport);

      let page = citationFocus.page ?? null;
      let matchedQuery = queries[0];

      if (!page) {
        for (const query of queries) {
          const found = await findPageForQuery(pdf, query, 1);
          if (found) {
            page = found;
            matchedQuery = query;
            break;
          }
        }
      }

      if (!page) {
        if (!cancelled) onCitationMiss?.();
        return;
      }

      if (cancelled) return;

      scrollToPage(page);

      // Wait for the text layer to render then highlight.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 80));
        const layer = viewport.querySelector(`[data-page="${page}"] .pdf-preview-text-layer`);
        if (!(layer instanceof HTMLElement) || !layer.querySelector("span")) continue;
        const highlightQueries = page === citationFocus.page ? queries : [matchedQuery, ...queries];
        for (const query of highlightQueries) {
          const mark = highlightPdfTextLayer(layer, query);
          if (mark) {
            mark.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
        }
      }

      if (!cancelled) onCitationMiss?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [citationFocus, pdf, latexSource, scrollToPage, onCitationMiss]);

  const pageNumbers = useMemo(
    () => (pdf ? Array.from({ length: numPages }, (_, index) => index + 1) : []),
    [pdf, numPages],
  );

  const lookupSynctex = useCallback(
    async (
      page: number,
      x: number,
      y: number,
      word: string | undefined,
      context: string | undefined,
      jobname: string,
    ) => {
      const hit = await lookupSynctexInverse(
        synctexBase64 ?? "",
        pdfBase64 ?? "",
        page,
        x,
        y,
        jobname,
        word ?? "",
        latexSource,
        context ?? "",
        compileCacheId ? { cacheId: compileCacheId } : undefined,
      );
      if (hit.found && hit.line > 0) return hit;
      return null;
    },
    [synctexBase64, pdfBase64, latexSource, compileCacheId],
  );

  const handleSynctexClick = useCallback(
    async (page: number, x: number, y: number, word?: string, context?: string) => {
      const canUseCache = Boolean(compileCacheId?.trim());
      if ((!synctexBase64 || !pdfBase64) && !canUseCache) return;
      if (!onSynctexHit) return;
      if (synctexBusyRef.current) return;
      synctexBusyRef.current = true;
      setSynctexHint("Syncing to source…");
      try {
        const jobname = mainFile.replace(/\.(tex|latex)$/i, "") || "main";
        const hit = await lookupSynctex(page, x, y, word, context, jobname);
        if (hit) {
          onSynctexHit(hit.file || mainFile, hit.line, word, hit.column, context);
          const label = word
            ? `${hit.file || mainFile}:${hit.line} (“${word}”)`
            : `${hit.file || mainFile}:${hit.line}`;
          flashSynctexHint(`Jumped to ${label}`);
        } else {
          flashSynctexHint(
            "No source line here — Compile (full) again, then double-click directly on text.",
          );
        }
      } catch {
        flashSynctexHint(
          unreachableServerMessage("SyncTeX failed — check the backend and restart npm run dev"),
        );
      } finally {
        synctexBusyRef.current = false;
      }
    },
    [
      synctexBase64,
      pdfBase64,
      mainFile,
      onSynctexHit,
      lookupSynctex,
      flashSynctexHint,
      compileCacheId,
    ],
  );

  const handlePageNotReady = useCallback(() => {
    flashSynctexHint("PDF page still loading — wait a moment and try again.");
  }, [flashSynctexHint]);

  // handleSynctexClick changes with every source edit (latexSource); pages get a stable proxy so
  // the memoized page views are not re-rendered on each keystroke.
  const handleSynctexClickRef = useLatestRef(handleSynctexClick);
  const handlePageClick = useCallback(
    (page: number, x: number, y: number, word?: string, context?: string) => {
      void handleSynctexClickRef.current(page, x, y, word, context);
    },
    [handleSynctexClickRef],
  );

  const compilerOptions: { value: LatexCompiler; label: string }[] = [
    { value: "auto", label: t.pdf.compilerAuto },
    { value: "pdflatex", label: "pdfLaTeX" },
    { value: "xelatex", label: "XeLaTeX" },
    { value: "lualatex", label: "LuaLaTeX" },
  ];

  const availableCompilerOptions = compilerOptions.filter((opt) => {
    if (opt.value === "auto") return true;
    const fromProps = compilersAvailable?.[opt.value];
    if (fromProps !== undefined) return fromProps;
    return enginesInfo[opt.value] !== false;
  });

  return (
    <section
      className={`pdf-preview-shell relative flex min-h-0 min-w-0 flex-col ${
        mobile ? "flex-1 w-full" : "h-full w-full"
      }`}
    >
      <header className="pdf-preview-toolbar-top editor-toolbar-scroll h-11 shrink-0 px-3 md:px-4">
        <div className="flex h-full w-max min-w-full items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2.5">
            {readOnly ? (
              <span className="pdf-preview-toolbar-muted inline-flex items-center gap-2 whitespace-nowrap font-mono text-[11px]">
                {isCompiling ? (
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
                    {t.pdf.compiling}
                  </span>
                ) : numPages > 0 ? (
                  t.pdf.pagesOf(currentPage, numPages)
                ) : (
                  t.pdf.noPdfYet
                )}
                {compileError && (
                  <button
                    type="button"
                    onClick={onCompile}
                    disabled={isCompiling}
                    className="pdf-preview-compile-btn inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-semibold text-white transition disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3 w-3 ${isCompiling ? "animate-spin" : ""}`} />
                    {t.pdf.compile}
                  </button>
                )}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCompile}
                  disabled={isCompiling}
                  className="pdf-preview-compile-btn inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 shrink-0 ${isCompiling ? "animate-spin" : ""}`}
                  />
                  {isCompiling ? t.pdf.compiling : t.pdf.compile}
                </button>
                <span className="pdf-preview-toolbar-muted whitespace-nowrap font-mono text-[11px]">
                  {numPages > 0 ? t.pdf.pagesOf(currentPage, numPages) : t.pdf.noPdfYet}
                </span>
                {onCompilerChange && (
                  <select
                    value={compiler}
                    onChange={(e) => onCompilerChange(e.target.value as LatexCompiler)}
                    className="pdf-preview-toolbar-select shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] outline-none"
                    title="LaTeX compiler (Overleaf-style)"
                  >
                    {availableCompilerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!readOnly && compileLog && !searchOpen && (
              <button
                type="button"
                onClick={() => setLogOpen((v) => !v)}
                className="pdf-preview-toolbar-btn rounded px-2 py-1 font-mono text-[10px]"
              >
                {t.pdf.log}
              </button>
            )}
            {!readOnly && searchOpen ? (
              <div className="pdf-preview-toolbar-search mr-1 flex items-center gap-0.5 rounded px-1.5 py-0.5">
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (searchMatches.length) {
                        if (e.shiftKey) handleSearchPrev();
                        else handleSearchNext();
                      } else {
                        void runSearch(searchQuery, 0);
                      }
                    }
                    if (e.key === "Escape") closeSearch();
                  }}
                  placeholder={t.pdf.findInPdf}
                  className="w-28 bg-transparent text-[11px] outline-none md:w-36"
                  aria-label={t.pdf.findInPdf}
                />
                {searchMatches.length > 0 ? (
                  <span className="pdf-preview-toolbar-muted shrink-0 font-mono text-[10px]">
                    {t.pdf.searchMatchOf(activeMatchIndex + 1, searchMatches.length)}
                  </span>
                ) : searchQuery.trim() && searchStatus ? (
                  <span className="pdf-preview-toolbar-muted shrink-0 text-[10px]">
                    {searchStatus}
                  </span>
                ) : null}
                <button
                  type="button"
                  title={t.pdf.searchPrev}
                  onClick={handleSearchPrev}
                  disabled={!searchMatches.length || isSearching}
                  className="pdf-preview-toolbar-muted inline-flex h-5 w-5 items-center justify-center rounded disabled:opacity-40"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title={t.pdf.searchNext}
                  onClick={handleSearchNext}
                  disabled={!searchMatches.length || isSearching}
                  className="pdf-preview-toolbar-muted inline-flex h-5 w-5 items-center justify-center rounded disabled:opacity-40"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={closeSearch}
                  className="pdf-preview-toolbar-muted inline-flex h-5 w-5 items-center justify-center rounded"
                  aria-label={t.tools.close}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : !readOnly ? (
              <IconBtn title={t.pdf.search} onClick={() => setSearchOpen(true)} disabled={!pdf}>
                <Search className="pdf-preview-toolbar-muted h-3.5 w-3.5" />
              </IconBtn>
            ) : null}

            {readOnly ? (
              <span className="pdf-preview-toolbar-muted font-mono text-[11px]">
                {displayZoom}%
              </span>
            ) : !searchOpen ? (
              <select
                value={zoomMode === "fit" ? 100 : zoomMode}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setZoomMode(value === 100 ? "fit" : (value as ZoomPreset));
                }}
                className="pdf-preview-toolbar-btn pdf-preview-toolbar-select rounded px-1 py-1 font-mono text-[11px] outline-none"
              >
                <option value={100}>{t.pdf.fit}</option>
                {ZOOM_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}%
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="pdf-preview-viewport soft-scrollbar min-w-0 flex-1 overflow-auto pb-12"
      >
        {!pdf && !isCompiling && (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-6 text-center">
            <p className="pdf-preview-toolbar-muted max-w-sm text-sm">
              {readOnly ? t.pdf.readOnlyEmptyHint : t.pdf.emptyHint}
            </p>
            {engineReady === false && !compileError && (
              <p className="mt-3 max-w-md text-xs text-amber-800">
                {import.meta.env.DEV ? (
                  <>
                    Chưa phát hiện <code className="rounded bg-amber-100 px-1">pdflatex</code>. Cài
                    MiKTeX:{" "}
                    <code className="rounded bg-amber-100 px-1">winget install MiKTeX.MiKTeX</code>{" "}
                    rồi restart backend.
                  </>
                ) : (
                  t.pdf.engineUnavailable
                )}
              </p>
            )}
            {engineReady === null && !compileError && (
              <p className="mt-3 max-w-md text-xs text-[#888]">Đang kiểm tra engine LaTeX…</p>
            )}
            {(compileError || loadError) && (
              <div className="mt-4 flex max-w-full flex-col items-center gap-3">
                <pre className="max-h-48 w-full max-w-lg overflow-auto rounded border border-red-200 bg-red-50 p-3 text-left text-[10px] text-red-700 whitespace-pre-wrap">
                  {compileError || loadError}
                </pre>
                {onCompile && compileError && (
                  <button
                    type="button"
                    onClick={onCompile}
                    disabled={isCompiling}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-800 shadow-sm transition hover:bg-red-50 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isCompiling ? "animate-spin" : ""}`} />
                    {t.pdf.compile}
                  </button>
                )}
                {onAskArioFix && compileError && (
                  <button
                    type="button"
                    onClick={onAskArioFix}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Ask Ario to fix
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {isCompiling && !pdf && (
          <div className="pdf-preview-toolbar-muted flex h-full min-h-[24rem] items-center justify-center text-sm">
            Compiling LaTeX…
          </div>
        )}

        {pdf && compileWarning && (
          <div className="mx-auto mb-3 max-w-2xl rounded border border-amber-300 bg-amber-50 px-3 py-2 text-left text-[11px] text-amber-900">
            {compileWarning}
          </div>
        )}

        {pdf && (
          <div className="pdf-preview-pages mx-auto flex w-max flex-col items-center py-5">
            {pageNumbers.map((pageNumber) => (
              <PdfPageView
                key={pageNumber}
                pdf={pdf}
                pageNumber={pageNumber}
                scale={effectiveScale}
                linkService={linkService}
                onVisible={handlePageVisible}
                onPageClick={synctexEnabled ? handlePageClick : undefined}
                onPageNotReady={synctexEnabled ? handlePageNotReady : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="pdf-preview-toolbar-bottom pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-black/10 bg-[#1C1C1E]/80 px-1.5 py-1 backdrop-blur-md">
          <IconBtn
            title="Previous page"
            onClick={handlePrevPage}
            disabled={!pdf || currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4 text-white/90" />
          </IconBtn>
          <span className="min-w-[4rem] text-center font-mono text-[11px] text-white/80">
            {numPages > 0 ? `${currentPage} / ${numPages}` : "— / —"}
          </span>
          <IconBtn
            title="Next page"
            onClick={handleNextPage}
            disabled={!pdf || currentPage >= numPages}
          >
            <ChevronRight className="h-4 w-4 text-white/90" />
          </IconBtn>
          <div className="mx-1 h-3.5 w-px bg-white/20" />
          <IconBtn title="Zoom out" onClick={handleZoomOut} disabled={!pdf}>
            <ZoomOut className="h-3.5 w-3.5 text-white/90" />
          </IconBtn>
          <span className="min-w-[2.25rem] text-center font-mono text-[10px] text-white/70">
            {displayZoom}%
          </span>
          <IconBtn title="Zoom in" onClick={handleZoomIn} disabled={!pdf}>
            <ZoomIn className="h-3.5 w-3.5 text-white/90" />
          </IconBtn>
        </div>
      </footer>

      <CompileLogPanel log={compileLog ?? ""} open={logOpen} onClose={() => setLogOpen(false)} />

      {synctexEnabled && pdf && (
        <div className="pointer-events-none absolute top-12 left-1/2 z-10 -translate-x-1/2 rounded bg-[#333]/80 px-2 py-0.5 text-[10px] text-white/80">
          {synctexHint ?? "Double-click PDF to jump to source (SyncTeX)"}
        </div>
      )}
    </section>
  );
});
