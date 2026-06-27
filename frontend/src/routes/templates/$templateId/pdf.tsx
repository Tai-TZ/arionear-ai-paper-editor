import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { fetchTemplate, fetchTemplatePdfBytes, templatePdfUrl } from "@/lib/api/templates-api";
import { templatesCopy } from "@/lib/templates-i18n";

type ViewerModule = typeof import("@/components/templates/template-pdf-viewer");

export const Route = createFileRoute("/templates/$templateId/pdf")({
  ssr: false,
  component: TemplatePdfPage,
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function TemplatePdfPage() {
  const { templateId } = Route.useParams();
  const { locale } = useLocale();
  const t = useMemo(() => templatesCopy(locale), [locale]);
  const [title, setTitle] = useState("Template");
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [fitWidth, setFitWidth] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [viewer, setViewer] = useState<ViewerModule | null>(null);

  const onNumPages = useCallback((count: number) => {
    setNumPages(count);
    setPageNumber((p) => Math.min(Math.max(1, p), count));
  }, []);

  const onViewerError = useCallback((message: string) => {
    setError(message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfData(null);

    Promise.all([fetchTemplate(templateId), fetchTemplatePdfBytes(templateId)])
      .then(([meta, bytes]) => {
        if (cancelled) return;
        setTitle(locale === "vi" && meta.title_vi ? meta.title_vi : meta.title);
        setPdfData(bytes.slice());
        setPageNumber(1);
        setNumPages(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "PDF not available.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locale, templateId]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const next = Math.floor(el.getBoundingClientRect().width);
      setViewportWidth(next > 0 ? next : null);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === "undefined") return;

    import("@/components/templates/template-pdf-viewer")
      .then((mod) => {
        if (!cancelled) setViewer(mod);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF viewer.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const TemplatePdfViewer = viewer?.TemplatePdfViewer;

  return (
    <div className="template-pdf-page flex min-h-screen flex-col bg-[#525659]">
      <header className="flex min-h-12 shrink-0 flex-col gap-2 border-b border-black/20 bg-[#323639] px-4 py-2 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/templates/$templateId"
            params={{ templateId }}
            className="shrink-0 text-sm text-white/80 hover:text-white"
          >
            ← {title}
          </Link>
          <span className="truncate text-sm font-medium">{t.pdfTitle}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm">
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={!numPages || pageNumber <= 1}
              className="rounded px-2 py-0.5 text-white/90 hover:bg-white/10 disabled:opacity-50"
            >
              ←
            </button>
            <span className="px-1 tabular-nums text-white/90">
              {numPages ? `${pageNumber} / ${numPages}` : "—"}
            </span>
            <button
              type="button"
              onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
              disabled={!numPages || pageNumber >= numPages}
              className="rounded px-2 py-0.5 text-white/90 hover:bg-white/10 disabled:opacity-50"
            >
              →
            </button>
          </div>

          <div className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setFitWidth(false);
                setScale((s) => clamp(Number((s - 0.1).toFixed(2)), 0.5, 2.2));
              }}
              className="rounded px-2 py-0.5 text-white/90 hover:bg-white/10"
              title="Zoom out"
            >
              −
            </button>
            <span className="w-14 text-center tabular-nums text-white/90">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={() => {
                setFitWidth(false);
                setScale((s) => clamp(Number((s + 0.1).toFixed(2)), 0.5, 2.2));
              }}
              className="rounded px-2 py-0.5 text-white/90 hover:bg-white/10"
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setFitWidth((v) => !v)}
              className={`rounded px-2 py-0.5 hover:bg-white/10 ${fitWidth ? "text-white" : "text-white/80"}`}
              title="Fit to width"
            >
              Fit
            </button>
          </div>

          <a
            href={templatePdfUrl(templateId)}
            download
            className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-2 py-1 text-sm hover:bg-white/10"
          >
            <Download className="h-4 w-4" />
            PDF
          </a>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-white/80">
          <Loader2 className="h-6 w-6 animate-spin" />
          {t.loading}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
          <p>{error}</p>
          <Link
            to="/templates/$templateId"
            params={{ templateId }}
            className="text-sm text-white/80 hover:text-white"
          >
            ← {t.backToGallery}
          </Link>
        </div>
      ) : (
        <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mx-auto w-full max-w-[1100px]">
            <div className="rounded-md bg-white shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
              {TemplatePdfViewer && pdfData ? (
                <TemplatePdfViewer
                  pdfData={pdfData}
                  pageNumber={pageNumber}
                  scale={scale}
                  fitWidth={fitWidth}
                  viewportWidth={viewportWidth}
                  onNumPages={onNumPages}
                  onError={onViewerError}
                />
              ) : (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading viewer…
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
