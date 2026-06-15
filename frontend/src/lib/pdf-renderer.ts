import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export type PdfPageRenderResult = {
  pageNumber: number;
  width: number;
  height: number;
  viewport: PageViewport;
};

export async function loadPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  const loadingTask = getDocument({ data: data.slice() });
  return loadingTask.promise;
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<PdfPageRenderResult> {
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;

  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  await page.render({ canvasContext: context, viewport }).promise;

  return {
    pageNumber: page.pageNumber,
    width: viewport.width,
    height: viewport.height,
    viewport,
  };
}

export async function renderPageTextLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  viewport: PageViewport,
): Promise<TextLayer> {
  container.replaceChildren();
  const textLayer = new TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport,
  });
  await textLayer.render();
  return textLayer;
}

export async function findPageForQuery(
  pdf: PDFDocumentProxy,
  query: string,
  startPage = 1,
): Promise<number | null> {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;

  for (let pageNumber = startPage; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const haystack = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .toLowerCase();
    if (haystack.includes(needle)) {
      return pageNumber;
    }
  }

  for (let pageNumber = 1; pageNumber < startPage; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const haystack = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .toLowerCase();
    if (haystack.includes(needle)) {
      return pageNumber;
    }
  }

  return null;
}

export function computeFitScale(containerWidth: number, pageWidth: number, padding = 48): number {
  const available = Math.max(120, containerWidth - padding);
  return Math.min(2, Math.max(0.35, available / pageWidth));
}
