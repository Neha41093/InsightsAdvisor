import type { UniversalDataFile, DataFormat, TabularData } from '../types';

/**
 * Robust CSV/DSV line parser handling quotes, commas, escaped characters
 */
function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detect best delimiter from sample lines
 */
function detectDelimiter(sampleLines: string[]): string | null {
  const candidates = [',', '\t', ';', '|'];
  let bestDelimiter: string | null = null;
  let maxConsistentCount = 0;

  for (const delim of candidates) {
    const counts = sampleLines.map((l) => (l.match(new RegExp(`\\${delim}`, 'g')) || []).length);
    const nonZeroCounts = counts.filter((c) => c > 0);
    if (nonZeroCounts.length >= 2) {
      const avg = nonZeroCounts.reduce((a, b) => a + b, 0) / nonZeroCounts.length;
      if (avg > maxConsistentCount) {
        maxConsistentCount = avg;
        bestDelimiter = delim;
      }
    }
  }

  return bestDelimiter;
}

/**
 * Try to parse structured tabular data from raw text
 */
function tryExtractTabular(lines: string[]): TabularData | undefined {
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length < 1) return undefined;

  const sample = nonEmptyLines.slice(0, 10);
  const delimiter = detectDelimiter(sample);
  if (!delimiter) return undefined;

  const parsedRows = nonEmptyLines.map((line) => parseDelimitedLine(line, delimiter));
  if (parsedRows.length === 0 || parsedRows[0].length <= 1) return undefined;

  // Normalize column count iteratively so large files (50k-200k+ rows) don't overflow the call stack
  let maxCols = 0;
  for (let i = 0; i < parsedRows.length; i++) {
    if (parsedRows[i].length > maxCols) {
      maxCols = parsedRows[i].length;
    }
  }
  if (maxCols <= 1) return undefined;

  let headers: string[] = [];
  let rows: (string | number | boolean | null)[][] = [];

  // Determine if first row is likely a header
  const firstRow = parsedRows[0];
  const isFirstRowAllStrings = firstRow.every((val) => isNaN(Number(val)) && val.trim().length > 0);

  if (isFirstRowAllStrings && parsedRows.length > 1) {
    headers = firstRow;
    while (headers.length < maxCols) {
      headers.push(`Column ${headers.length + 1}`);
    }
    rows = parsedRows.slice(1).map((r) => {
      const padded = [...r];
      while (padded.length < maxCols) padded.push('');
      return padded;
    });
  } else {
    // Generate fallback headers without rejecting
    headers = Array.from({ length: maxCols }, (_, i) => `Col ${i + 1}`);
    rows = parsedRows.map((r) => {
      const padded = [...r];
      while (padded.length < maxCols) padded.push('');
      return padded;
    });
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
    totalColumns: headers.length,
  };
}

/**
 * PII Scrubber & Prompt-Injection Boundary Sanitizer:
 * 1. Masks sensitive PII (emails, SSNs, credit card numbers, phone numbers, API keys)
 *    before data is stored in memory or dispatched to Gemini.
 * 2. Neutralizes embedded XML boundary escapes or UI delimiter spoofing inside untrusted files.
 */
export function scrubPIIAndSanitize(raw: string): string {
  if (!raw) return '';

  return (
    raw
      // 1. Mask Email Addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
      // 2. Mask US Social Security Numbers (SSN: XXX-XX-XXXX, avoids YYYY-MM-DD dates)
      .replace(/\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, '[REDACTED_SSN]')
      // 3. Mask 16-digit Credit/Debit Card numbers (XXXX-XXXX-XXXX-XXXX or XXXX XXXX XXXX XXXX)
      .replace(/\b(?:\d{4}[ -]){3}\d{4}\b/g, '[REDACTED_CARD]')
      // 4. Mask formatted Phone Numbers (e.g. (555) 234-5678, +1-555-234-5678, 555-234-5678)
      .replace(/(?:\+\d{1,2}\s*)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[REDACTED_PHONE]')
      // 5. Mask common API keys / secret tokens
      .replace(/\b(?:sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z\-_]{35}|ghp_[A-Za-z0-9]{36})\b/g, '[REDACTED_SECRET]')
      // 6. Escape any attempt inside untrusted data to break out of XML prompt-injection boundaries
      .replace(/<\/?untrusted_dataset_context>/gi, '[ESCAPED_BOUNDARY_TAG]')
      .replace(/<\/?user_query>/gi, '[ESCAPED_QUERY_TAG]')
      // 7. Prevent untrusted data from spoofing internal UI extraction blocks
      .replace(/<<<(END_)?(CHART_DATA|TOOL_EXECUTION)>>>/gi, '[ESCAPED_UI_TAG]')
  );
}

/**
 * Universal data file parser that accepts any structured or unstructured content
 */
export function parseUniversalData(
  fileName: string,
  rawInputText: string,
  fileSize?: number
): UniversalDataFile {
  const rawText = scrubPIIAndSanitize(rawInputText);
  const trimmed = rawText.trim();
  const size = fileSize || new Blob([rawText]).size;
  const lines = rawText.split(/\r\n|\n/);
  const lineCount = lines.length;
  const charCount = rawText.length;
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const summaryPreview = lines.slice(0, 12).join('\n');

  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';

  // 1. Check for JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      let tabular: TabularData | undefined = undefined;

      // If array of objects, extract tabular representation
      if (Array.isArray(parsedJson) && parsedJson.length > 0 && typeof parsedJson[0] === 'object' && parsedJson[0] !== null) {
        const headerSet = new Set<string>();
        parsedJson.slice(0, 100).forEach((item) => {
          if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach((k) => headerSet.add(k));
          }
        });
        const headers = Array.from(headerSet);
        if (headers.length > 0) {
          const rows = parsedJson.map((item) =>
            headers.map((h) => {
              const val = item[h];
              if (val === undefined || val === null) return '';
              if (typeof val === 'object') return JSON.stringify(val);
              return String(val);
            })
          );
          tabular = {
            headers,
            rows,
            totalRows: rows.length,
            totalColumns: headers.length,
          };
        }
      }

      return {
        name: fileName,
        size,
        format: 'json',
        formatLabel: Array.isArray(parsedJson) ? 'JSON Array' : 'JSON Object',
        rawText,
        parsedJson,
        tabular,
        lineCount,
        wordCount,
        charCount,
        summaryPreview,
      };
    } catch {
      // Not valid single JSON, proceed to other checks
    }
  }

  // 2. Check for JSONL
  if (lines.length > 1 && (ext === 'jsonl' || ext === 'ndjson' || lines.slice(0, 5).every((l) => l.trim().startsWith('{') && l.trim().endsWith('}')))) {
    try {
      const validObjects: any[] = [];
      for (const line of lines) {
        const l = line.trim();
        if (l) {
          validObjects.push(JSON.parse(l));
        }
      }
      if (validObjects.length > 0) {
        const headerSet = new Set<string>();
        validObjects.slice(0, 100).forEach((item) => {
          if (typeof item === 'object' && item !== null) {
            Object.keys(item).forEach((k) => headerSet.add(k));
          }
        });
        const headers = Array.from(headerSet);
        const rows = validObjects.map((item) =>
          headers.map((h) => {
            const val = item[h];
            if (val === undefined || val === null) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
          })
        );

        return {
          name: fileName,
          size,
          format: 'jsonl',
          formatLabel: 'Newline-Delimited JSON (JSONL)',
          rawText,
          parsedJson: validObjects,
          tabular: {
            headers,
            rows,
            totalRows: rows.length,
            totalColumns: headers.length,
          },
          lineCount,
          wordCount,
          charCount,
          summaryPreview,
        };
      }
    } catch {
      // Fallback
    }
  }

  // 3. Tabular extraction (CSV, TSV, DSV, Excel spreadsheets converted to CSV)
  const isExcelExt = ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'ods';
  if (ext !== 'pdf') {
    const tabular = tryExtractTabular(lines);
    if (tabular && tabular.rows.length > 0 && (isExcelExt || ext === 'csv' || ext === 'tsv' || ext === 'dsv' || tabular.totalColumns >= 2)) {
      return {
        name: fileName,
        size,
        format: 'tabular',
        formatLabel: isExcelExt
          ? `Excel Spreadsheet (${ext!.toUpperCase()})`
          : ext === 'tsv'
          ? 'TSV (Tab-Separated)'
          : 'Delimited Table (CSV/DSV)',
        rawText,
        tabular,
        lineCount,
        wordCount,
        charCount,
        summaryPreview,
      };
    }
  }

  // 3b. PDF Document (extracted page text)
  if (ext === 'pdf') {
    return {
      name: fileName,
      size,
      format: 'pdf',
      formatLabel: 'PDF Document',
      rawText,
      lineCount,
      wordCount,
      charCount,
      summaryPreview,
    };
  }

  // 4. XML / HTML
  if (trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && trimmed.includes('</'))) {
    return {
      name: fileName,
      size,
      format: 'xml',
      formatLabel: 'XML Document',
      rawText,
      lineCount,
      wordCount,
      charCount,
      summaryPreview,
    };
  }

  // 5. YAML
  if (ext === 'yaml' || ext === 'yml' || (trimmed.includes(':') && lines.some((l) => /^\s*-\s+/.test(l)))) {
    return {
      name: fileName,
      size,
      format: 'yaml',
      formatLabel: 'YAML Configuration',
      rawText,
      lineCount,
      wordCount,
      charCount,
      summaryPreview,
    };
  }

  // 6. Log files (timestamps, log levels)
  const isLogLike =
    ext === 'log' ||
    lines.slice(0, 10).some((l) =>
      /(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}:\d{2}|\[INFO\]|\[ERROR\]|\[WARN\]|\[DEBUG\]|\[FATAL\]|HTTP\/\d)/i.test(l)
    );
  if (isLogLike) {
    return {
      name: fileName,
      size,
      format: 'log',
      formatLabel: 'System / Application Log',
      rawText,
      lineCount,
      wordCount,
      charCount,
      summaryPreview,
    };
  }

  // 7. Markdown / Documentation
  if (ext === 'md' || ext === 'markdown' || lines.some((l) => /^#+\s+/.test(l) || /^\*\s+/.test(l))) {
    return {
      name: fileName,
      size,
      format: 'markdown',
      formatLabel: 'Markdown Document',
      rawText,
      lineCount,
      wordCount,
      charCount,
      summaryPreview,
    };
  }

  // 8. Code files
  const codeExts = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'sql', 'sh', 'rb', 'go', 'rs', 'cpp', 'c', 'php', 'html', 'css'];
  if (ext && codeExts.includes(ext)) {
    return {
      name: fileName,
      size,
      format: 'code',
      formatLabel: `${ext.toUpperCase()} Source Code`,
      rawText,
      lineCount,
      wordCount,
      charCount,
      summaryPreview,
    };
  }

  // 9. Default: Unstructured Text (documents, transcripts, meeting notes, freeform text)
  return {
    name: fileName,
    size,
    format: 'unstructured_text',
    formatLabel: 'Unstructured Text / Document',
    rawText,
    lineCount,
    wordCount,
    charCount,
    summaryPreview,
  };
}

/**
 * Fast O(1) content fingerprint over first 128 + last 128 characters
 * to prevent cache key collisions when different files share the same name and byte size.
 */
export function fastContentHash(text?: string): string {
  if (!text) return '0';
  const sample = text.length <= 256 ? text : text.slice(0, 128) + text.slice(-128);
  let h = 2166136261;
  for (let i = 0; i < sample.length; i++) {
    h = Math.imul(h ^ sample.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(36);
}

export function computeDatasetCacheKey(fileName: string, sizeOrLen: number, rawText?: string): string {
  const base = `${fileName || 'uploaded_data_file'}:${sizeOrLen}`;
  return rawText ? `${base}:${fastContentHash(rawText)}` : base;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
