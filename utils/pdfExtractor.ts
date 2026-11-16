import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Extracts structured, line-preserved text from a PDF file in the browser.
 * Groups text fragments by vertical baseline (Y coordinate) and sorts left-to-right (X)
 * so tables, columns, and paragraphs remain legible.
 */
export async function extractPdfText(buffer: ArrayBuffer | Uint8Array): Promise<PdfExtractionResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const positioned: PositionedTextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && item.str && item.str.trim().length > 0) {
        const transform = (item as any).transform;
        const x = Array.isArray(transform) ? Number(transform[4] ?? 0) : 0;
        const y = Array.isArray(transform) ? Number(transform[5] ?? 0) : 0;
        positioned.push({ str: item.str, x, y });
      }
    }

    if (positioned.length === 0) continue;

    // Sort top-to-bottom (descending PDF Y), then left-to-right (ascending X)
    positioned.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 3) {
        return b.y - a.y;
      }
      return a.x - b.x;
    });

    const lines: string[] = [];
    let currentLineItems: PositionedTextItem[] = [];
    let currentY: number | null = null;

    for (const item of positioned) {
      if (currentY === null || Math.abs(item.y - currentY) <= 3) {
        currentLineItems.push(item);
        if (currentY === null) currentY = item.y;
      } else {
        currentLineItems.sort((a, b) => a.x - b.x);
        lines.push(currentLineItems.map((i) => i.str).join(' ').replace(/\s{2,}/g, ' ').trim());
        currentLineItems = [item];
        currentY = item.y;
      }
    }

    if (currentLineItems.length > 0) {
      currentLineItems.sort((a, b) => a.x - b.x);
      lines.push(currentLineItems.map((i) => i.str).join(' ').replace(/\s{2,}/g, ' ').trim());
    }

    const body = lines.filter(Boolean).join('\n');
    if (body) {
      pageTexts.push(`--- Page ${pageNum} of ${pageCount} ---\n${body}`);
    }
  }

  const combinedText = pageTexts.join('\n\n').trim();
  if (!combinedText) {
    throw new Error(
      'No selectable text was found in this PDF (it may be a scanned image-only PDF without an embedded text layer).'
    );
  }

  return {
    text: combinedText,
    pageCount,
  };
}
