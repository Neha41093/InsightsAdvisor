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

  // Normalize column count so ragged rows don't break rendering
  const maxCols = Math.max(...parsedRows.map((r) => r.length));
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
 * Universal data file parser that accepts any structured or unstructured content
 */
export function parseUniversalData(
  fileName: string,
  rawText: string,
  fileSize?: number
): UniversalDataFile {
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

  // 3. Tabular extraction (CSV, TSV, DSV)
  const tabular = tryExtractTabular(lines);
  if (tabular && tabular.rows.length > 0 && (ext === 'csv' || ext === 'tsv' || ext === 'dsv' || tabular.totalColumns >= 2)) {
    return {
      name: fileName,
      size,
      format: 'tabular',
      formatLabel: ext === 'tsv' ? 'TSV (Tab-Separated)' : 'Delimited Table (CSV/DSV)',
      rawText,
      tabular,
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

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
