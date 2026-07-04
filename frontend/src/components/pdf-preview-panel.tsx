import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  fetchCompileStatus,
  lookupSynctexInverse,
  type LatexCompiler,
} from "@/lib/api/academic";
import { CompileLogPanel } from "@/components/compile-log-panel";
import {
  computeFitScale,
  collectPdfSearchMatches,
  extractPdfWordContext,
  findPageForQuery,
  loadPdfDocument,
  pdfPointFromClick,
  refineSynctexPoint,
  renderPageAnnotationLayer,
  renderPageTextLayer,
  renderPageToCanvas,
  type PdfPageRenderResult,
  type PdfSearchMatch,
} from "@/lib/pdf-renderer";
import { PdfLinkService } from "@/lib/pdf-link-service";
import { capturePdfClickWord, resolveSynctexLine } from "@/lib/synctex-highlight";
import { useLocale } from "@/components/locale-provider";
import { editorCopy } from "@/lib/editor-i18n";
import type { DefensePdfCitationFocus } from "@/lib/defense-pdf-links";
import { clearPdfHighlights, highlightPdfTextLayer, highlightPdfTextLayerOccurrence } from "@/lib/pdf-text-highlight";

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
  /** Scroll to and highlight a citation from defense chat links. */
  citationFocus?: DefensePdfCitationFocus | null;
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

function PdfPageView({
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
  onPageClick?: (
    pageNumber: number,
    x: number,
    y: number,
    word?: string,
    context?: string,
  ) => void;
  onPageNotReady?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [pageViewport, setPageViewport] = useState<PageViewport | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTokenRef = useRef(0);

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

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled || token !== renderTokenRef.current) return;
      pageRef.current = page;

      const rendered: PdfPageRenderResult = await renderPageToCanvas(page, canvas, scale);
      if (cancelled || token !== renderTokenRef.current) return;

      setDimensions({ width: rendered.width, height: rendered.height });
      setPageViewport(rendered.viewport);
      await renderPageTextLayer(page, textLayer, rendered.viewport);
      await renderPageAnnotationLayer(page, annotationLayer, rendered.viewport, linkService);
    })().catch(() => {
      if (!cancelled) {
        setDimensions(null);
        setPageViewport(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale, linkService]);

  return (
    <div
      ref={rootRef}
      data-page={pageNumber}
      className="pdf-preview-page-sheet"
      onDoubleClick={(e) => {
        if (!onPageClick || !canvasRef.current) return;
        if (!pageViewport) {
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
          let [pdfX, pdfY] = pdfPointFromClick(pageViewport, rect, clientX, clientY);
          let context = "";
          if (pageRef.current) {
            [pdfX, pdfY] = await refineSynctexPoint(pageRef.current, pdfX, pdfY, word);
            const ctx = await extractPdfWordContext(pageRef.current, pdfX, pdfY, word);
            if (ctx?.word && !word) word = ctx.word;
            context = ctx?.context ?? "";
          }
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
        style={
          dimensions
            ? { width: dimensions.width, height: dimensions.height }
            : undefined
        }
      >
        <canvas ref={canvasRef} className="pdf-preview-canvas" />
        <div ref={textLayerRef} className="textLayer pdf-preview-text-layer" />
        <div ref={annotationLayerRef} className="pdf-preview-annotation-layer" />
      </div>
    </div>
  );
}

export function PdfPreviewPanel({
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
        if (cancelled) return;
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

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateFit = () => {
      setFitScale(computeFitScale(el.clientWidth, basePageWidth));
    };

    updateFit();
    const observer = new ResizeObserver(updateFit);
    observer.observe(el);
    return () => observer.disconnect();
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
        const layer = viewport.querySelector(
          `[data-page="${match.page}"] .pdf-preview-text-layer`,
        );
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
        const matches = await collectPdfSearchMatches(pdf, query);
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
        setIsSearching(false);
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
    const prev =
      activeMatchIndex <= 0 ? searchMatches.length - 1 : activeMatchIndex - 1;
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

    const query = citationFocus.search.trim();
    if (!query) return;

    let cancelled = false;

    (async () => {
      clearPdfHighlights(viewport);
      const page = citationFocus.page ?? (await findPageForQuery(pdf, query, 1));
      if (!page || cancelled) return;

      scrollToPage(page);

      // Wait for the text layer to render then highlight.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (cancelled) return;
        await new Promise((resolve) => setTimeout(resolve, 80));
        const layer = viewport.querySelector(
          `[data-page="${page}"] .pdf-preview-text-layer`,
        );
        if (!(layer instanceof HTMLElement) || !layer.querySelector("span")) continue;
        const mark = highlightPdfTextLayer(layer, query);
        if (mark) {
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [citationFocus, pdf, latexSource, scrollToPage]);

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
        synctexBase64!,
        pdfBase64!,
        page,
        x,
        y,
        jobname,
        word ?? "",
        latexSource,
        context ?? "",
      );
      if (hit.found && hit.line > 0) return hit;
      return null;
    },
    [synctexBase64, pdfBase64, latexSource],
  );

  const handleSynctexClick = useCallback(
    async (page: number, x: number, y: number, word?: string, context?: string) => {
      if (!synctexBase64 || !pdfBase64 || !onSynctexHit) return;
      if (synctexBusyRef.current) return;
      synctexBusyRef.current = true;
      setSynctexHint("Syncing to source…");
      try {
        const jobname = mainFile.replace(/\.(tex|latex)$/i, "") || "main";
        const hit = await lookupSynctex(page, x, y, word, context, jobname);
        if (hit) {
          const resolvedLine =
            word && latexSource
              ? resolveSynctexLine(latexSource, hit.line, word, hit.column, context)
              : hit.line;
          onSynctexHit(hit.file || mainFile, resolvedLine, word, hit.column, context);
          const label = word
            ? `${hit.file || mainFile}:${resolvedLine} (“${word}”)`
            : `${hit.file || mainFile}:${resolvedLine}`;
          flashSynctexHint(`Jumped to ${label}`);
        } else {
          flashSynctexHint("No source line here — double-click directly on text, then Compile again.");
        }
      } catch {
        flashSynctexHint("SyncTeX failed — start backend on port 8001 and restart npm run dev.");
      } finally {
        synctexBusyRef.current = false;
      }
    },
    [synctexBase64, pdfBase64, mainFile, latexSource, onSynctexHit, lookupSynctex, flashSynctexHint],
  );

  const handlePageNotReady = useCallback(() => {
    flashSynctexHint("PDF page still loading — wait a moment and try again.");
  }, [flashSynctexHint]);

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
      className={`pdf-preview-shell relative flex min-h-0 flex-col ${
        mobile ? "flex-1 w-full" : "h-full w-full"
      }`}
    >
      <header className="pdf-preview-toolbar-top flex h-11 shrink-0 items-center justify-between px-3 md:px-4">
        <div className="flex items-center gap-2.5">
          {readOnly ? (
            <span className="pdf-preview-toolbar-muted font-mono text-[11px]">
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
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={onCompile}
                disabled={isCompiling}
                className="pdf-preview-compile-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isCompiling ? "animate-spin" : ""}`} />
                {isCompiling ? t.pdf.compiling : t.pdf.compile}
              </button>
              <span className="pdf-preview-toolbar-muted font-mono text-[11px]">
                {numPages > 0 ? t.pdf.pagesOf(currentPage, numPages) : t.pdf.noPdfYet}
              </span>
              {onCompilerChange && (
                <select
                  value={compiler}
                  onChange={(e) => onCompilerChange(e.target.value as LatexCompiler)}
                  className="pdf-preview-toolbar-select rounded px-1.5 py-0.5 font-mono text-[10px] outline-none"
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

        <div className="flex items-center gap-1.5">
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
            <span className="pdf-preview-toolbar-muted font-mono text-[11px]">{displayZoom}%</span>
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
      </header>

      <div
        ref={viewportRef}
        className="pdf-preview-viewport soft-scrollbar flex-1 overflow-y-auto overflow-x-hidden pb-12"
      >
        {!pdf && !isCompiling && (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center px-6 text-center">
            <p className="pdf-preview-toolbar-muted max-w-sm text-sm">
              {readOnly ? t.pdf.readOnlyEmptyHint : t.pdf.emptyHint}
            </p>
            {engineReady === false && !compileError && (
              <p className="mt-3 max-w-md text-xs text-amber-800">
                Chưa phát hiện <code className="rounded bg-amber-100 px-1">pdflatex</code>. Cài MiKTeX:{" "}
                <code className="rounded bg-amber-100 px-1">winget install MiKTeX.MiKTeX</code>
                {" "}rồi restart backend.
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
                key={`${pageNumber}-${effectiveScale}`}
                pdf={pdf}
                pageNumber={pageNumber}
                scale={effectiveScale}
                linkService={linkService}
                onVisible={handlePageVisible}
                onPageClick={synctexBase64 ? handleSynctexClick : undefined}
                onPageNotReady={synctexBase64 ? handlePageNotReady : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="pdf-preview-toolbar-bottom pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-black/10 bg-[#1C1C1E]/80 px-1.5 py-1 backdrop-blur-md">
          <IconBtn title="Previous page" onClick={handlePrevPage} disabled={!pdf || currentPage <= 1}>
            <ChevronLeft className="h-4 w-4 text-white/90" />
          </IconBtn>
          <span className="min-w-[4rem] text-center font-mono text-[11px] text-white/80">
            {numPages > 0 ? `${currentPage} / ${numPages}` : "— / —"}
          </span>
          <IconBtn title="Next page" onClick={handleNextPage} disabled={!pdf || currentPage >= numPages}>
            <ChevronRight className="h-4 w-4 text-white/90" />
          </IconBtn>
          <div className="mx-1 h-3.5 w-px bg-white/20" />
          <IconBtn title="Zoom out" onClick={handleZoomOut} disabled={!pdf}>
            <ZoomOut className="h-3.5 w-3.5 text-white/90" />
          </IconBtn>
          <span className="min-w-[2.25rem] text-center font-mono text-[10px] text-white/70">{displayZoom}%</span>
          <IconBtn title="Zoom in" onClick={handleZoomIn} disabled={!pdf}>
            <ZoomIn className="h-3.5 w-3.5 text-white/90" />
          </IconBtn>
        </div>
      </footer>

      <CompileLogPanel log={compileLog ?? ""} open={logOpen} onClose={() => setLogOpen(false)} />

      {synctexBase64 && pdf && (
        <div className="pointer-events-none absolute top-12 left-1/2 z-10 -translate-x-1/2 rounded bg-[#333]/80 px-2 py-0.5 text-[10px] text-white/80">
          {synctexHint ?? "Double-click PDF to jump to source (SyncTeX)"}
        </div>
      )}
    </section>
  );
}
