import {
  AnnotationLayer,
  DOMSVGFactory,
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
} from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfLinkService } from "@/lib/pdf-link-service";
import { parseInternalPdfLink } from "@/lib/pdf-link-service";

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

export function pdfPointFromClick(
  viewport: PageViewport,
  canvasRect: DOMRect,
  clientX: number,
  clientY: number,
): [number, number] {
  const vx = (clientX - canvasRect.left) * (viewport.width / canvasRect.width);
  const vy = (clientY - canvasRect.top) * (viewport.height / canvasRect.height);
  const [pdfX, pdfY] = viewport.convertToPdfPoint(vx, vy);
  return [pdfX, pdfY];
}

type TextBBox = { xMin: number; xMax: number; yMin: number; yMax: number; str: string };

function textItemBBox(item: { str: string; transform: number[]; width: number }): TextBBox {
  const [, , , , ex, ey] = item.transform;
  const width = item.width || 0;
  const height = Math.hypot(item.transform[2], item.transform[3]) || 12;
  return {
    xMin: ex,
    xMax: ex + width,
    yMin: ey - height * 0.15,
    yMax: ey + height * 0.85,
    str: item.str,
  };
}

function bboxDistance(b: TextBBox, pdfX: number, pdfY: number): number {
  const cx = (b.xMin + b.xMax) / 2;
  const cy = (b.yMin + b.yMax) / 2;
  return (pdfX - cx) ** 2 + (pdfY - cy) ** 2;
}

function bboxContains(b: TextBBox, pdfX: number, pdfY: number, pad = 3): boolean {
  return (
    pdfX >= b.xMin - pad &&
    pdfX <= b.xMax + pad &&
    pdfY >= b.yMin - pad &&
    pdfY <= b.yMax + pad
  );
}

/** Snap raw click to the center of the PDF text glyph box (fixes duplicate labels on one page). */
export async function refineSynctexPoint(
  page: PDFPageProxy,
  pdfX: number,
  pdfY: number,
  wordHint?: string,
): Promise<[number, number]> {
  const content = await page.getTextContent();
  const boxes: TextBBox[] = [];

  for (const raw of content.items) {
    if (!("str" in raw) || !raw.str.trim()) continue;
    boxes.push(textItemBBox(raw as { str: string; transform: number[]; width: number }));
  }

  const needle = wordHint?.trim().toLowerCase();
  let best: { dist: number; x: number; y: number } | null = null;

  for (const box of boxes) {
    if (needle) {
      const hay = box.str.toLowerCase();
      if (!hay.includes(needle) && !needle.includes(hay.trim())) continue;
    }

    const cx = (box.xMin + box.xMax) / 2;
    const cy = (box.yMin + box.yMax) / 2;
    const dist = bboxDistance(box, pdfX, pdfY);
    const inside = bboxContains(box, pdfX, pdfY);

    if (!inside && needle && dist > 40000) continue;

    if (!best || (inside && dist < best.dist) || dist < best.dist) {
      best = { dist, x: cx, y: cy };
    }
  }

  if (best) return [best.x, best.y];
  return [pdfX, pdfY];
}

export type PdfWordContext = {
  word: string;
  context: string;
};

const ROW_Y_TOL = 6;

function normalizePdfText(raw: string): string {
  return raw
    .replace(/[\u00AD\u200B\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read the clicked word plus nearby PDF text to disambiguate repeated words in source. */
export async function extractPdfWordContext(
  page: PDFPageProxy,
  pdfX: number,
  pdfY: number,
  wordHint?: string,
): Promise<PdfWordContext | null> {
  const content = await page.getTextContent();
  const boxes: TextBBox[] = [];

  for (const raw of content.items) {
    if (!("str" in raw) || !raw.str.trim()) continue;
    boxes.push(textItemBBox(raw as { str: string; transform: number[]; width: number }));
  }
  if (!boxes.length) return null;

  const needle = wordHint?.trim().toLowerCase();
  let anchor: { box: TextBBox; dist: number } | null = null;

  for (const box of boxes) {
    const dist = bboxDistance(box, pdfX, pdfY);
    const inside = bboxContains(box, pdfX, pdfY);
    if (needle) {
      const hay = box.str.toLowerCase();
      if (!inside && !hay.includes(needle) && !needle.includes(hay.trim()) && dist > 40000) {
        continue;
      }
    }
    if (!anchor || (inside && dist < anchor.dist) || dist < anchor.dist) {
      anchor = { box, dist };
    }
  }
  if (!anchor) return null;

  const clickY = (anchor.box.yMin + anchor.box.yMax) / 2;
  const rowItems = boxes
    .filter((box) => Math.abs((box.yMin + box.yMax) / 2 - clickY) <= ROW_Y_TOL)
    .sort((a, b) => a.xMin - b.xMin);

  const rowText = normalizePdfText(rowItems.map((box) => box.str).join(" "));
  if (!rowText) return null;

  let word = wordHint ? normalizePdfText(wordHint) : "";
  let wordIndex = word ? rowText.toLowerCase().indexOf(word.toLowerCase()) : -1;

  if (wordIndex < 0 && needle) {
    for (const box of rowItems) {
      if (box.str.toLowerCase().includes(needle)) {
        word = normalizePdfText(box.str);
        wordIndex = rowText.toLowerCase().indexOf(word.toLowerCase());
        if (wordIndex >= 0) break;
      }
    }
  }

  if (!word) return null;

  const contextStart = Math.max(0, wordIndex >= 0 ? wordIndex - 40 : 0);
  const contextEnd =
    wordIndex >= 0
      ? Math.min(rowText.length, wordIndex + word.length + 40)
      : Math.min(rowText.length, 80);
  const context = rowText.slice(contextStart, contextEnd).trim() || rowText.slice(0, 80);

  return { word, context };
}

export async function renderPageTextLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  viewport: PageViewport,
): Promise<TextLayer> {
  container.replaceChildren();
  // PDF.js 4 TextLayer positions/fontSize use calc(var(--scale-factor) * …).
  // Without this, selection highlights drift left/right of the rendered glyphs.
  container.style.setProperty("--scale-factor", String(viewport.scale));
  const textLayer = new TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport,
  });
  await textLayer.render();
  return textLayer;
}

export async function renderPageAnnotationLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  viewport: PageViewport,
  linkService: PdfLinkService,
): Promise<AnnotationLayer> {
  container.replaceChildren();
  container.className = "annotationLayer pdf-preview-annotation-layer";
  container.style.setProperty("--scale-factor", String(viewport.scale));
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;

  const layer = new AnnotationLayer({
    div: container,
    accessibilityManager: null,
    annotationCanvasMap: null,
    annotationEditorUIManager: null,
    page,
    viewport,
    structTreeLayer: null,
  });

  const annotations = await page.getAnnotations({ intent: "display" });
  await layer.render({
    viewport,
    div: container,
    annotations,
    page,
    linkService,
    renderForms: false,
    svgFactory: new DOMSVGFactory(),
  });

  bindInternalPdfLinkClicks(container, linkService);

  return layer;
}

function bindInternalPdfLinkClicks(container: HTMLElement, linkService: PdfLinkService) {
  container.addEventListener(
    "click",
    (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      const dest = href.startsWith("#") && href.length > 1
        ? decodeURIComponent(href.slice(1))
        : parseInternalPdfLink(href);
      if (!dest) return;
      event.preventDefault();
      event.stopPropagation();
      void linkService.goToDestination(dest);
    },
    true,
  );
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
