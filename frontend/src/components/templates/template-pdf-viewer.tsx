import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { computeFitScale, loadPdfDocument, renderPageToCanvas } from "@/lib/pdf-renderer";

type TemplatePdfViewerProps = {
  pdfData: Uint8Array;
  pageNumber: number;
  scale: number;
  fitWidth: boolean;
  viewportWidth: number | null;
  onNumPages: (count: number) => void;
  onError: (message: string) => void;
};

export function TemplatePdfViewer({
  pdfData,
  pageNumber,
  scale,
  fitWidth,
  viewportWidth,
  onNumPages,
  onError,
}: TemplatePdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setRendering(true);

    loadPdfDocument(pdfData.slice())
      .then((loaded) => {
        if (cancelled) return;
        doc = loaded;
        setPdf(loaded);
        onNumPages(loaded.numPages);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : "Failed to load PDF.");
      });

    return () => {
      cancelled = true;
      setPdf(null);
      void doc?.loadingTask.destroy();
    };
  }, [pdfData, onError, onNumPages]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;
    setRendering(true);

    pdf
      .getPage(pageNumber)
      .then(async (page) => {
        if (cancelled || !canvasRef.current) return;
        let renderScale = scale;
        if (fitWidth && viewportWidth) {
          const base = page.getViewport({ scale: 1 });
          renderScale = computeFitScale(viewportWidth, base.width, 32);
        }
        await renderPageToCanvas(page, canvasRef.current, renderScale);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : "Failed to render PDF page.");
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale, fitWidth, viewportWidth, onError]);

  return (
    <div className="relative flex min-h-[480px] items-start justify-center p-4">
      {rendering ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/70 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Rendering…
        </div>
      ) : null}
      <canvas ref={canvasRef} className="max-w-full shadow-sm" />
    </div>
  );
}
