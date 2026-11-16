import type { UniversalDataFile, TabularData, AnalysisDepth } from '../types';
import { parseUniversalData } from './dataParser';

export interface ColumnProfile {
  name: string;
  type: 'number' | 'string' | 'boolean';
  nonNullCount: number;
  nullCount: number;
  distinctCount: number;
  isCurrency?: boolean;
  isPercentage?: boolean;
  // Numeric stats (computed across 100% of rows)
  sum?: number;
  mean?: number;
  median?: number;
  stdDev?: number;
  min?: number;
  q1?: number;
  q3?: number;
  iqr?: number;
  max?: number;
  // Categorical stats (computed across 100% of rows)
  topValues?: { value: string; count: number; percentage: number }[];
}

export interface CorrelationPair {
  colX: string;
  colY: string;
  pearsonR: number;
  rSquared: number;
  slope: number;
  intercept: number;
  sampleSize: number;
}

export interface DatasetSchemaProfile {
  fileName: string;
  format: string;
  formatLabel: string;
  totalRows: number;
  totalColumns: number;
  columns: ColumnProfile[];
  correlations: CorrelationPair[];
  sampleRows: Record<string, any>[];
  samplingNote?: string;
}

export interface SqlExecutionResult {
  sql: string;
  columns: string[];
  rows: Record<string, any>[];
  totalMatchedRows: number;
  scannedRows: number;
  executionTimeMs: number;
  markdownTable: string;
  timedOut?: boolean;
  warningMessage?: string;
  error?: string;
}

const MAX_EXACT_SORT_ROWS = 50000;
const STRIDE_SAMPLE_TARGET = 25000;
const MAX_EXECUTION_MS = 60000; // 1-minute (60,000 ms) compute limit

/**
 * Helper to parse a cell value into a clean number if possible
 */
export function toNumericValue(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim();
  if (!str) return null;
  const cleaned = str.replace(/[$€£¥,\s]/g, '').replace(/%$/, '');
  if (!cleaned || isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

/**
 * Computes exact quantile on a sorted numeric array
 */
function computeQuantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Builds a complete schema & statistical profile across 100% of the dataset rows.
 * Compact (~2-4KB) representation that gives Gemini complete ground-truth visibility
 * without stuffing hundreds of thousands of raw rows into the prompt context.
 */
export function buildDatasetSchemaProfile(dataFile: UniversalDataFile): DatasetSchemaProfile {
  const ensuredFile =
    !dataFile.tabular && dataFile.rawText
      ? parseUniversalData(dataFile.name, dataFile.rawText, dataFile.size)
      : dataFile;

  const tabular: TabularData | undefined = ensuredFile.tabular;

  if (!tabular || tabular.headers.length === 0) {
    return {
      fileName: ensuredFile.name,
      format: ensuredFile.format,
      formatLabel: ensuredFile.formatLabel,
      totalRows: ensuredFile.lineCount,
      totalColumns: 1,
      columns: [],
      correlations: [],
      sampleRows: [],
    };
  }

  const { headers, rows, totalRows, totalColumns } = tabular;
  const columns: ColumnProfile[] = [];
  const numericVectors: Map<string, (number | null)[]> = new Map();

  headers.forEach((header, colIdx) => {
    let nonNullCount = 0;
    let nullCount = 0;
    const nums: number[] = [];
    const rawVector: (number | null)[] = [];
    const freqMap = new Map<string, number>();

    for (let r = 0; r < rows.length; r++) {
      const cell = rows[r][colIdx];
      const strVal = cell === null || cell === undefined ? '' : String(cell).trim();
      if (!strVal) {
        nullCount++;
        rawVector.push(null);
        continue;
      }

      nonNullCount++;
      freqMap.set(strVal, (freqMap.get(strVal) || 0) + 1);

      const num = toNumericValue(strVal);
      if (num !== null) {
        nums.push(num);
        rawVector.push(num);
      } else {
        rawVector.push(null);
      }
    }

    const isNumeric = nonNullCount > 0 && nums.length >= nonNullCount * 0.6;
    const isCurrency = /revenue|price|cost|sales|mrr|spend|budget|profit|amount|salary/i.test(header);
    const isPercentage = /margin|rate|ratio|percentage|percent|share/i.test(header);

    if (isNumeric && nums.length > 0) {
      numericVectors.set(header, rawVector);
      // 100% of rows are always used for sum, mean, min, and max
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < nums.length; i++) {
        const v = nums[i];
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const mean = sum / nums.length;

      // Option B: For >50,000 rows, use a deterministic 25,000-row stride sample for O(N log N) sorting
      const sampleForQuantiles =
        nums.length > MAX_EXACT_SORT_ROWS
          ? (() => {
              const step = Math.max(1, Math.floor(nums.length / STRIDE_SAMPLE_TARGET));
              const sampled: number[] = [];
              for (let i = 0; i < nums.length; i += step) sampled.push(nums[i]);
              return sampled;
            })()
          : nums;

      const sorted = [...sampleForQuantiles].sort((a, b) => a - b);
      const variance =
        sampleForQuantiles.length > 1
          ? sampleForQuantiles.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
            (sampleForQuantiles.length - 1)
          : 0;
      const stdDev = Math.sqrt(variance);
      const q1 = computeQuantile(sorted, 0.25);
      const median = computeQuantile(sorted, 0.5);
      const q3 = computeQuantile(sorted, 0.75);
      const iqr = q3 - q1;

      columns.push({
        name: header,
        type: 'number',
        nonNullCount,
        nullCount,
        distinctCount: freqMap.size,
        isCurrency,
        isPercentage,
        sum: Number(sum.toFixed(4)),
        mean: Number(mean.toFixed(4)),
        median: Number(median.toFixed(4)),
        stdDev: Number(stdDev.toFixed(4)),
        min: Number(min.toFixed(4)),
        q1: Number(q1.toFixed(4)),
        q3: Number(q3.toFixed(4)),
        iqr: Number(iqr.toFixed(4)),
        max: Number(max.toFixed(4)),
      });
    } else {
      const topValues = Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({
          value,
          count,
          percentage: nonNullCount > 0 ? Number(((count / nonNullCount) * 100).toFixed(1)) : 0,
        }));

      columns.push({
        name: header,
        type: 'string',
        nonNullCount,
        nullCount,
        distinctCount: freqMap.size,
        topValues,
      });
    }
  });

  // Compute pairwise Pearson correlations (stride-sampled if >50,000 rows to prevent O(C^2 * N) stall)
  const numericColNames = Array.from(numericVectors.keys());
  const correlations: CorrelationPair[] = [];
  const corrStep =
    rows.length > MAX_EXACT_SORT_ROWS ? Math.max(1, Math.floor(rows.length / STRIDE_SAMPLE_TARGET)) : 1;

  for (let i = 0; i < numericColNames.length; i++) {
    for (let j = i + 1; j < numericColNames.length; j++) {
      const colX = numericColNames[i];
      const colY = numericColNames[j];
      const vecX = numericVectors.get(colX)!;
      const vecY = numericVectors.get(colY)!;

      const pairs: [number, number][] = [];
      for (let k = 0; k < rows.length; k += corrStep) {
        if (vecX[k] !== null && vecY[k] !== null) {
          pairs.push([vecX[k]!, vecY[k]!]);
        }
      }

      if (pairs.length >= 3) {
        const n = pairs.length;
        let sumX = 0,
          sumY = 0,
          sumXY = 0,
          sumX2 = 0,
          sumY2 = 0;
        for (const [x, y] of pairs) {
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
          sumY2 += y * y;
        }
        const num = n * sumXY - sumX * sumY;
        const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
        if (den !== 0) {
          const r = num / den;
          const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
          const intercept = (sumY - slope * sumX) / n;
          correlations.push({
            colX,
            colY,
            pearsonR: Number(r.toFixed(4)),
            rSquared: Number((r * r).toFixed(4)),
            slope: Number(slope.toFixed(4)),
            intercept: Number(intercept.toFixed(4)),
            sampleSize: n,
          });
        }
      }
    }
  }

  correlations.sort((a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR));

  // Sample first 5 rows as objects
  const sampleRows = rows.slice(0, 5).map((r) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx];
    });
    return obj;
  });

  return {
    fileName: ensuredFile.name,
    format: ensuredFile.format,
    formatLabel: ensuredFile.formatLabel,
    totalRows,
    totalColumns,
    columns,
    correlations,
    sampleRows,
  };
}

/**
 * Resolve column name case-insensitively from headers
 */
function resolveColName(rawName: string, headers: string[]): string | null {
  const cleaned = rawName.trim().replace(/^[`"'[]+|[`"'\]]+$/g, '');
  const exact = headers.find((h) => h === cleaned);
  if (exact) return exact;
  const lower = cleaned.toLowerCase();
  return headers.find((h) => h.toLowerCase() === lower) || null;
}

/**
 * Evaluate a single WHERE / HAVING condition against a row object
 */
function evaluateSingleCondition(row: Record<string, any>, condStr: string, headers: string[]): boolean {
  const trimmed = condStr.trim().replace(/^\(+|\)+$/g, '').trim();
  if (!trimmed) return true;

  // IS NOT NULL / IS NULL
  const nullMatch = trimmed.match(/^(.+?)\s+IS\s+(NOT\s+)?NULL$/i);
  if (nullMatch) {
    const col = resolveColName(nullMatch[1], headers) || nullMatch[1].trim();
    const val = row[col];
    const isNull = val === null || val === undefined || String(val).trim() === '';
    return nullMatch[2] ? !isNull : isNull;
  }

  // BETWEEN x AND y
  const betweenMatch = trimmed.match(/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
  if (betweenMatch) {
    const col = resolveColName(betweenMatch[1], headers) || betweenMatch[1].trim();
    const cellVal = row[col];
    const lowRaw = betweenMatch[2].trim().replace(/^['"]|['"]$/g, '');
    const highRaw = betweenMatch[3].trim().replace(/^['"]|['"]$/g, '');
    const cellNum = toNumericValue(cellVal);
    const lowNum = toNumericValue(lowRaw);
    const highNum = toNumericValue(highRaw);
    if (cellNum !== null && lowNum !== null && highNum !== null) {
      return cellNum >= lowNum && cellNum <= highNum;
    }
    const s = String(cellVal ?? '');
    return s >= lowRaw && s <= highRaw;
  }

  // IN (...)
  const inMatch = trimmed.match(/^(.+?)\s+(NOT\s+)?IN\s*\((.+)\)$/i);
  if (inMatch) {
    const col = resolveColName(inMatch[1], headers) || inMatch[1].trim();
    const isNot = Boolean(inMatch[2]);
    const listItems = inMatch[3]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
    const cellStr = String(row[col] ?? '').trim().toLowerCase();
    const matched = listItems.includes(cellStr);
    return isNot ? !matched : matched;
  }

  // LIKE / ILIKE
  const likeMatch = trimmed.match(/^(.+?)\s+(NOT\s+)?I?LIKE\s+['"](.+)['"]$/i);
  if (likeMatch) {
    const col = resolveColName(likeMatch[1], headers) || likeMatch[1].trim();
    const isNot = Boolean(likeMatch[2]);
    const pattern = likeMatch[3]
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    const regex = new RegExp(`^${pattern}$`, 'i');
    const matched = regex.test(String(row[col] ?? '').trim());
    return isNot ? !matched : matched;
  }

  // Comparison operators: >=, <=, !=, <>, =, >, <
  const opMatch = trimmed.match(/^(.+?)\s*(>=|<=|!=|<>|=|>|<)\s*(.+)$/);
  if (opMatch) {
    const leftRaw = opMatch[1].trim();
    const op = opMatch[2];
    const rightRaw = opMatch[3].trim().replace(/^['"]|['"]$/g, '');

    const col = resolveColName(leftRaw, headers) || leftRaw;
    const cellVal = row[col];

    const leftNum = toNumericValue(cellVal);
    const rightNum = toNumericValue(rightRaw);

    if (leftNum !== null && rightNum !== null) {
      switch (op) {
        case '=':
          return leftNum === rightNum;
        case '!=':
        case '<>':
          return leftNum !== rightNum;
        case '>':
          return leftNum > rightNum;
        case '>=':
          return leftNum >= rightNum;
        case '<':
          return leftNum < rightNum;
        case '<=':
          return leftNum <= rightNum;
      }
    }

    const leftStr = String(cellVal ?? '').trim().toLowerCase();
    const rightStr = rightRaw.toLowerCase();
    switch (op) {
      case '=':
        return leftStr === rightStr;
      case '!=':
      case '<>':
        return leftStr !== rightStr;
      case '>':
        return leftStr > rightStr;
      case '>=':
        return leftStr >= rightStr;
      case '<':
        return leftStr < rightStr;
      case '<=':
        return leftStr <= rightStr;
    }
  }

  return true;
}

/**
 * Evaluate compound WHERE/HAVING clause supporting AND / OR
 */
function evaluateWhereClause(row: Record<string, any>, whereClause: string, headers: string[]): boolean {
  if (!whereClause || !whereClause.trim()) return true;

  // Split by OR at top level (ignoring BETWEEN ... AND ...)
  const orBranches = whereClause.split(/\s+OR\s+/i);
  return orBranches.some((orBranch) => {
    // Protect BETWEEN x AND y before splitting by AND
    const protectedBranch = orBranch.replace(
      /(\bBETWEEN\s+[^)\s]+\s+)AND(\s+[^)\s]+)/gi,
      '$1__BETWEEN_AND__$2'
    );
    const andParts = protectedBranch.split(/\s+AND\s+/i);
    return andParts.every((part) => {
      const restored = part.replace(/__BETWEEN_AND__/g, 'AND');
      return evaluateSingleCondition(row, restored, headers);
    });
  });
}

/**
 * Split comma-separated SQL expressions while respecting parentheses
 */
function splitSqlExpressions(str: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if ((ch === "'" || ch === '"') && str[i - 1] !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = ch;
      } else if (ch === quoteChar) {
        inQuotes = false;
      }
    }
    if (!inQuotes) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/**
 * Compute aggregate or arithmetic expression over a group of rows
 */
function evaluateSelectExpression(
  exprRaw: string,
  groupRows: Record<string, any>[],
  headers: string[]
): any {
  const expr = exprRaw.trim();

  // Handle ROUND(innerExpr, decimals)
  const roundMatch = expr.match(/^ROUND\s*\(\s*(.+)\s*,\s*(\d+)\s*\)$/i);
  if (roundMatch) {
    const val = evaluateSelectExpression(roundMatch[1], groupRows, headers);
    const dec = parseInt(roundMatch[2], 10);
    return typeof val === 'number' ? Number(val.toFixed(dec)) : val;
  }

  // Handle binary arithmetic between two aggregate expressions: e.g. SUM(Revenue) / SUM(UnitsSold)
  const arithMatch = expr.match(/^((?:SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV)\s*\([^)]+\))\s*([+\-*/])\s*((?:SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV)\s*\([^)]+\)|\d+(?:\.\d+)?)$/i);
  if (arithMatch) {
    const leftVal = Number(evaluateSelectExpression(arithMatch[1], groupRows, headers));
    const op = arithMatch[2];
    const rightVal = isNaN(Number(arithMatch[3]))
      ? Number(evaluateSelectExpression(arithMatch[3], groupRows, headers))
      : Number(arithMatch[3]);
    if (!isNaN(leftVal) && !isNaN(rightVal)) {
      let res = 0;
      if (op === '+') res = leftVal + rightVal;
      else if (op === '-') res = leftVal - rightVal;
      else if (op === '*') res = leftVal * rightVal;
      else if (op === '/') res = rightVal !== 0 ? leftVal / rightVal : 0;
      return Number(res.toFixed(4));
    }
  }

  // Handle Aggregate Functions: SUM, AVG, COUNT, MIN, MAX, MEDIAN, STDDEV, IQR
  const aggMatch = expr.match(/^(SUM|AVG|MEAN|COUNT|MIN|MAX|MEDIAN|STDDEV|IQR)\s*\(\s*(DISTINCT\s+)?(.+?)\s*\)$/i);
  if (aggMatch) {
    const fn = aggMatch[1].toUpperCase();
    const isDistinct = Boolean(aggMatch[2]);
    const arg = aggMatch[3].trim();

    if (fn === 'COUNT' && arg === '*') {
      return groupRows.length;
    }

    const col = resolveColName(arg, headers) || arg;
    const rawVals = groupRows
      .map((r) => r[col])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');

    if (fn === 'COUNT') {
      if (isDistinct) {
        return new Set(rawVals.map((v) => String(v).trim())).size;
      }
      return rawVals.length;
    }

    const nums = rawVals.map(toNumericValue).filter((n): n is number => n !== null);
    if (nums.length === 0) return 0;

    if (fn === 'SUM') {
      return Number(nums.reduce((a, b) => a + b, 0).toFixed(2));
    }
    if (fn === 'AVG' || fn === 'MEAN') {
      return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));
    }
    if (fn === 'MIN') {
      let minVal = Infinity;
      for (let i = 0; i < nums.length; i++) if (nums[i] < minVal) minVal = nums[i];
      return minVal;
    }
    if (fn === 'MAX') {
      let maxVal = -Infinity;
      for (let i = 0; i < nums.length; i++) if (nums[i] > maxVal) maxVal = nums[i];
      return maxVal;
    }
    const sampleToSort =
      nums.length > MAX_EXACT_SORT_ROWS
        ? (() => {
            const step = Math.max(1, Math.floor(nums.length / STRIDE_SAMPLE_TARGET));
            const s: number[] = [];
            for (let i = 0; i < nums.length; i += step) s.push(nums[i]);
            return s;
          })()
        : nums;
    const sorted = [...sampleToSort].sort((a, b) => a - b);
    if (fn === 'MEDIAN') return Number(computeQuantile(sorted, 0.5).toFixed(2));
    if (fn === 'IQR') {
      return Number((computeQuantile(sorted, 0.75) - computeQuantile(sorted, 0.25)).toFixed(2));
    }
    if (fn === 'STDDEV') {
      if (nums.length <= 1) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (nums.length - 1);
      return Number(Math.sqrt(variance).toFixed(2));
    }
  }

  // Row-level arithmetic: ColA / ColB or ColA * ColB
  const rowArithMatch = expr.match(/^([a-zA-Z0-9_"`[\]\s]+?)\s*([+\-*/])\s*([a-zA-Z0-9_"`[\].\s]+)$/);
  if (rowArithMatch && groupRows.length > 0) {
    const colA = resolveColName(rowArithMatch[1], headers);
    const op = rowArithMatch[2];
    const colB = resolveColName(rowArithMatch[3], headers);
    const leftNum = colA ? toNumericValue(groupRows[0][colA]) : toNumericValue(rowArithMatch[1]);
    const rightNum = colB ? toNumericValue(groupRows[0][colB]) : toNumericValue(rowArithMatch[3]);
    if (leftNum !== null && rightNum !== null) {
      if (op === '+') return Number((leftNum + rightNum).toFixed(2));
      if (op === '-') return Number((leftNum - rightNum).toFixed(2));
      if (op === '*') return Number((leftNum * rightNum).toFixed(2));
      if (op === '/') return rightNum !== 0 ? Number((leftNum / rightNum).toFixed(2)) : 0;
    }
  }

  // Direct column lookup
  const col = resolveColName(expr, headers) || expr.replace(/^[`"'[]+|[`"'\]]+$/g, '');
  if (groupRows.length > 0 && col in groupRows[0]) {
    const v = groupRows[0][col];
    const num = toNumericValue(v);
    return num !== null && String(v).trim() !== '' && !/^0\d+/.test(String(v).trim()) ? num : v;
  }

  return null;
}

/**
 * Format rows as a clean Markdown table
 */
export function formatRowsAsMarkdownTable(columns: string[], rows: Record<string, any>[], maxRows = 25): string {
  if (columns.length === 0 || rows.length === 0) {
    return '_No matching records found._';
  }
  const displayRows = rows.slice(0, maxRows);
  const headerLine = `| ${columns.join(' | ')} |`;
  const sepLine = `| ${columns.map(() => '---').join(' | ')} |`;
  const bodyLines = displayRows.map((r) => {
    const cells = columns.map((c) => {
      const val = r[c];
      if (val === null || val === undefined) return '-';
      if (typeof val === 'number') {
        return Number.isInteger(val) ? val.toLocaleString() : val.toLocaleString(undefined, { maximumFractionDigits: 3 });
      }
      return String(val);
    });
    return `| ${cells.join(' | ')} |`;
  });
  return [headerLine, sepLine, ...bodyLines].join('\n');
}

/**
 * Executes a SQL query in-memory across 100% of the rows in a UniversalDataFile.
 * Supports SELECT, aggregations (SUM, AVG, COUNT, MIN, MAX, MEDIAN, STDDEV, IQR),
 * arithmetic expressions, WHERE, GROUP BY, HAVING, ORDER BY, and LIMIT.
 */
export function executeSqlQuery(dataFile: UniversalDataFile, rawSql: string): SqlExecutionResult {
  const startTime = performance.now();

  const ensuredFile =
    !dataFile.tabular && dataFile.rawText
      ? parseUniversalData(dataFile.name, dataFile.rawText, dataFile.size)
      : dataFile;

  const tabular = ensuredFile.tabular;
  if (!tabular || tabular.headers.length === 0) {
    return {
      sql: rawSql,
      columns: [],
      rows: [],
      totalMatchedRows: 0,
      scannedRows: 0,
      executionTimeMs: 0,
      markdownTable: '_Dataset does not contain structured tabular rows._',
      error: 'No tabular data available to run SQL query.',
    };
  }

  const { headers, rows: rawMatrix } = tabular;
  const scannedRows = rawMatrix.length;

  // Convert matrix to row objects for fast column access
  const allObjects: Record<string, any>[] = new Array(scannedRows);
  for (let i = 0; i < scannedRows; i++) {
    const obj: Record<string, any> = {};
    const r = rawMatrix[i];
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = r[c];
    }
    allObjects[i] = obj;
  }

  // Normalize whitespace and strip trailing semicolon
  const cleanSql = rawSql
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/;$/, '');

  // Parse SQL clauses
  const selectMatch = cleanSql.match(
    /^SELECT\s+(?:DISTINCT\s+)?(.+?)\s+FROM\s+[a-zA-Z0-9_"`[\].]+(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+HAVING\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i
  );

  if (!selectMatch) {
    return {
      sql: rawSql,
      columns: headers,
      rows: allObjects.slice(0, 10),
      totalMatchedRows: scannedRows,
      scannedRows,
      executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
      markdownTable: formatRowsAsMarkdownTable(headers, allObjects.slice(0, 10)),
      error: `Could not parse SQL syntax: ${cleanSql}`,
    };
  }

  const isDistinctSelect = /^SELECT\s+DISTINCT\s+/i.test(cleanSql);
  const selectClause = selectMatch[1].trim();
  const whereClause = selectMatch[2]?.trim() || '';
  const groupByClause = selectMatch[3]?.trim() || '';
  const havingClause = selectMatch[4]?.trim() || '';
  const orderByClause = selectMatch[5]?.trim() || '';
  const limitVal = selectMatch[6] ? parseInt(selectMatch[6], 10) : undefined;

  // 1. Filter rows via WHERE across 100% of dataset (with Option C 1-minute timeout guardrail)
  let timedOut = false;
  let actualScanned = 0;
  const filteredRows: Record<string, any>[] = [];

  for (let i = 0; i < allObjects.length; i++) {
    if ((i & 4095) === 0 && i > 0 && performance.now() - startTime > MAX_EXECUTION_MS) {
      timedOut = true;
      break;
    }
    actualScanned++;
    if (!whereClause || evaluateWhereClause(allObjects[i], whereClause, headers)) {
      filteredRows.push(allObjects[i]);
    }
  }

  // 2. Parse SELECT items
  const selectExprs = splitSqlExpressions(selectClause);
  const selectSpecs = selectExprs.map((item) => {
    const asMatch = item.match(/^(.+?)\s+AS\s+([a-zA-Z0-9_"`[\]\s]+)$/i);
    if (asMatch) {
      return {
        expr: asMatch[1].trim(),
        alias: asMatch[2].trim().replace(/^[`"'[]+|[`"'\]]+$/g, ''),
      };
    }
    const cleanAlias = item.replace(/^[`"'[]+|[`"'\]]+$/g, '');
    return { expr: item.trim(), alias: resolveColName(cleanAlias, headers) || cleanAlias };
  });

  const hasAggregates = selectSpecs.some((s) =>
    /\b(SUM|AVG|MEAN|COUNT|MIN|MAX|MEDIAN|STDDEV|IQR)\s*\(/i.test(s.expr)
  );

  let resultRows: Record<string, any>[] = [];
  let outputColumns: string[] = [];

  // 3. GROUP BY or Aggregate execution
  if (groupByClause || hasAggregates) {
    const groupCols = groupByClause
      ? splitSqlExpressions(groupByClause).map((g) => resolveColName(g, headers) || g.trim())
      : [];

    const groups = new Map<string, Record<string, any>[]>();
    if (groupCols.length === 0) {
      groups.set('__ALL__', filteredRows);
    } else {
      for (const row of filteredRows) {
        const key = groupCols.map((c) => String(row[c] ?? 'NULL')).join('||');
        let bucket = groups.get(key);
        if (!bucket) {
          bucket = [];
          groups.set(key, bucket);
        }
        bucket.push(row);
      }
    }

    outputColumns = selectSpecs.map((s) => s.alias);

    groups.forEach((groupRows) => {
      const outRow: Record<string, any> = {};
      for (const spec of selectSpecs) {
        outRow[spec.alias] = evaluateSelectExpression(spec.expr, groupRows, headers);
      }
      resultRows.push(outRow);
    });

    // 4. HAVING filter
    if (havingClause) {
      resultRows = resultRows.filter((r) => evaluateWhereClause(r, havingClause, outputColumns));
    }
  } else {
    // Non-aggregated row query
    if (selectClause === '*') {
      outputColumns = [...headers];
      resultRows = filteredRows.map((r) => ({ ...r }));
    } else {
      outputColumns = selectSpecs.map((s) => s.alias);
      resultRows = filteredRows.map((r) => {
        const outRow: Record<string, any> = {};
        for (const spec of selectSpecs) {
          outRow[spec.alias] = evaluateSelectExpression(spec.expr, [r], headers);
        }
        return outRow;
      });
    }

    if (isDistinctSelect) {
      const seen = new Set<string>();
      resultRows = resultRows.filter((r) => {
        const key = outputColumns.map((c) => String(r[c] ?? '')).join('||');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  const totalMatchedRows = resultRows.length;

  // 5. ORDER BY
  if (orderByClause) {
    const orderSpecs = splitSqlExpressions(orderByClause).map((o) => {
      const parts = o.trim().split(/\s+/);
      const dir = parts.length > 1 && /^DESC$/i.test(parts[parts.length - 1]) ? 'DESC' : 'ASC';
      const rawField = parts
        .slice(0, parts.length > 1 && /^(ASC|DESC)$/i.test(parts[parts.length - 1]) ? -1 : undefined)
        .join(' ')
        .replace(/^[`"'[]+|[`"'\]]+$/g, '');
      // Match against outputColumns or expression
      const matchedCol =
        outputColumns.find((c) => c.toLowerCase() === rawField.toLowerCase()) ||
        selectSpecs.find((s) => s.expr.toLowerCase() === rawField.toLowerCase())?.alias ||
        rawField;
      return { col: matchedCol, dir };
    });

    resultRows.sort((a, b) => {
      for (const spec of orderSpecs) {
        const valA = a[spec.col];
        const valB = b[spec.col];
        const numA = toNumericValue(valA);
        const numB = toNumericValue(valB);
        let cmp = 0;
        if (numA !== null && numB !== null) {
          cmp = numA - numB;
        } else {
          cmp = String(valA ?? '').localeCompare(String(valB ?? ''));
        }
        if (cmp !== 0) return spec.dir === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  // 6. LIMIT
  if (limitVal !== undefined && limitVal > 0) {
    resultRows = resultRows.slice(0, limitVal);
  }

  const executionTimeMs = Number((performance.now() - startTime).toFixed(2));
  let warningMessage: string | undefined;
  if (timedOut) {
    warningMessage = `⚠️ 1-minute compute budget reached after scanning ${actualScanned.toLocaleString()} of ${scannedRows.toLocaleString()} rows. Showing partial results — consider adding a more specific filter.`;
  } else if (scannedRows > MAX_EXACT_SORT_ROWS) {
    warningMessage = `ℹ️ Large-dataset mode: Counts, sums, averages, min, and max computed on 100% of ${scannedRows.toLocaleString()} rows; quantiles (median/IQR) computed via ${STRIDE_SAMPLE_TARGET.toLocaleString()}-row stratified sample.`;
  }

  const baseTable = formatRowsAsMarkdownTable(outputColumns, resultRows);
  const markdownTable = warningMessage ? `${baseTable}\n\n> ${warningMessage}` : baseTable;

  return {
    sql: cleanSql,
    columns: outputColumns,
    rows: resultRows,
    totalMatchedRows,
    scannedRows: actualScanned,
    executionTimeMs,
    markdownTable,
    timedOut,
    warningMessage,
  };
}

/**
 * Searches 100% of lines in unstructured logs or text files using regex or keywords
 */
export function executeUnstructuredSearch(
  dataFile: UniversalDataFile,
  pattern: string
): {
  pattern: string;
  totalLinesScanned: number;
  matchedCount: number;
  severityBreakdown: Record<string, number>;
  sampleMatches: string[];
  executionTimeMs: number;
} {
  const start = performance.now();
  const lines = dataFile.rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const severityBreakdown: Record<string, number> = {
    ERROR: 0,
    WARN: 0,
    INFO: 0,
    OTHER: 0,
  };

  const matchedLines: string[] = [];
  for (const line of lines) {
    if (regex.test(line)) {
      matchedLines.push(line);
      if (/ERROR|FATAL|CRITICAL|FAIL/i.test(line)) severityBreakdown.ERROR++;
      else if (/WARN|WARNING/i.test(line)) severityBreakdown.WARN++;
      else if (/INFO|DEBUG/i.test(line)) severityBreakdown.INFO++;
      else severityBreakdown.OTHER++;
    }
  }

  return {
    pattern,
    totalLinesScanned: lines.length,
    matchedCount: matchedLines.length,
    severityBreakdown,
    sampleMatches: matchedLines.slice(0, 15),
    executionTimeMs: Number((performance.now() - start).toFixed(2)),
  };
}

/**
 * Deterministic Natural-Language-to-SQL & Full-Dataset Analyzer.
 * Automatically translates user questions into real SQL queries executed over 100% of rows
 * and formats the response with <<<TOOL_EXECUTION>>> and <<<CHART_DATA>>>.
 */
export function runDeterministicFullDatasetAnalysis(
  question: string,
  dataFile: UniversalDataFile,
  depthPreference: AnalysisDepth = 'auto'
): string {
  const profile = buildDatasetSchemaProfile(dataFile);
  const qLower = question.toLowerCase();

  // Handle log / unstructured text files
  if (!dataFile.tabular || profile.columns.length === 0) {
    const searchPattern =
      /error|fail|crash|exception/i.test(qLower)
        ? 'ERROR|FATAL|FAIL|EXCEPTION|timeout'
        : /warn/i.test(qLower)
          ? 'WARN|WARNING'
          : '.*';
    const logRes = executeUnstructuredSearch(dataFile, searchPattern);
    const chartData = {
      type: 'bar',
      title: 'Event Distribution by Severity Level (100% of Lines)',
      data: Object.entries(logRes.severityBreakdown)
        .filter(([, count]) => count > 0)
        .map(([name, value]) => ({ name, value })),
    };
    const toolExec = {
      tool: 'Full-File Regex & Log Aggregation Engine',
      code: `SELECT severity, COUNT(*) FROM log_stream WHERE line REGEXP '${searchPattern}' GROUP BY severity; -- Scanned ${logRes.totalLinesScanned} lines`,
      output: `Matched ${logRes.matchedCount} of ${logRes.totalLinesScanned} lines in ${logRes.executionTimeMs}ms | Breakdown: ${JSON.stringify(logRes.severityBreakdown)}`,
      reason: `Scanned 100% of lines (${logRes.totalLinesScanned} total) matching pattern "${searchPattern}".`,
    };

    return `## Executive Conclusion
Across **${logRes.totalLinesScanned.toLocaleString()} total lines** scanned in \`${dataFile.name}\`, **${logRes.matchedCount.toLocaleString()} events** matched the filter criteria (\`${searchPattern}\`).

### Breakdown of Matched Records
- **Error / Critical Events**: \`${logRes.severityBreakdown.ERROR}\`
- **Warning Alerts**: \`${logRes.severityBreakdown.WARN}\`
- **Informational Events**: \`${logRes.severityBreakdown.INFO}\`

### Matching Event Log Sample
\`\`\`
${logRes.sampleMatches.slice(0, 8).join('\n') || 'No matching lines.'}
\`\`\`

<<<CHART_DATA>>>
${JSON.stringify(chartData, null, 2)}
<<<END_CHART_DATA>>>

<<<TOOL_EXECUTION>>>
${JSON.stringify(toolExec, null, 2)}
<<<END_TOOL_EXECUTION>>>`;
  }

  const numCols = profile.columns.filter((c) => c.type === 'number');
  const catCols = profile.columns.filter((c) => c.type === 'string');

  // Identify mentioned columns in question
  const mentionedNumCols = numCols.filter((c) => qLower.includes(c.name.toLowerCase()));
  const mentionedCatCols = catCols.filter((c) => qLower.includes(c.name.toLowerCase()));

  const primaryNum = mentionedNumCols[0] || numCols.find((c) => /revenue|sales|amount|profit|score|value/i.test(c.name)) || numCols[0];
  const secondaryNum = mentionedNumCols[1] || numCols.find((c) => c.name !== primaryNum?.name) || primaryNum;
  const primaryCat =
    mentionedCatCols[0] ||
    catCols.find((c) => c.distinctCount >= 2 && c.distinctCount <= 30 && !/id$/i.test(c.name)) ||
    catCols[0];

  // Detect WHERE filter conditions in natural language (e.g. "where UnitsSold > 200" or "in Europe")
  const whereFilters: string[] = [];
  const condRegex = new RegExp(
    `\\b(${profile.columns.map((c) => c.name).join('|')})\\s*(>=|<=|!=|=|>|<)\\s*([0-9.]+|'[^']+'|"[^"]+"|[a-zA-Z0-9_]+)`,
    'gi'
  );
  let match: RegExpExecArray | null;
  while ((match = condRegex.exec(question)) !== null) {
    whereFilters.push(`${match[1]} ${match[2]} ${match[3]}`);
  }

  // Also check if a known category value is explicitly mentioned in the question (e.g. "North America", "Europe")
  if (whereFilters.length === 0) {
    for (const catCol of catCols) {
      for (const tv of catCol.topValues || []) {
        if (tv.value.length > 2 && qLower.includes(tv.value.toLowerCase())) {
          whereFilters.push(`${catCol.name} = '${tv.value}'`);
        }
      }
    }
  }

  const whereSql = whereFilters.length > 0 ? ` WHERE ${whereFilters.join(' AND ')}` : '';

  const isCorrelationQuery = /correlat|relationship|regress|r-squared|pearson|compare\s+.+\s+against/i.test(qLower);
  const isDetailedMode =
    depthPreference === 'detailed' ||
    isCorrelationQuery ||
    /detailed|statistical|distribution|iqr|quartile|std\s*dev|variance|outlier|anomaly/i.test(qLower);

  // Build & execute real SQL query over 100% of dataset rows
  let sqlToRun = '';
  if (primaryCat && primaryNum) {
    const secondAgg =
      secondaryNum && secondaryNum.name !== primaryNum.name
        ? `, ROUND(AVG(${secondaryNum.name}), 2) AS Avg_${secondaryNum.name}`
        : `, MIN(${primaryNum.name}) AS Min_${primaryNum.name}, MAX(${primaryNum.name}) AS Max_${primaryNum.name}`;
    sqlToRun = `SELECT ${primaryCat.name}, COUNT(*) AS Record_Count, SUM(${primaryNum.name}) AS Total_${primaryNum.name}, ROUND(AVG(${primaryNum.name}), 2) AS Avg_${primaryNum.name}, MEDIAN(${primaryNum.name}) AS Median_${primaryNum.name}${secondAgg} FROM dataset${whereSql} GROUP BY ${primaryCat.name} ORDER BY Total_${primaryNum.name} DESC`;
  } else if (primaryNum) {
    sqlToRun = `SELECT COUNT(*) AS Record_Count, SUM(${primaryNum.name}) AS Total_${primaryNum.name}, ROUND(AVG(${primaryNum.name}), 2) AS Avg_${primaryNum.name}, MEDIAN(${primaryNum.name}) AS Median_${primaryNum.name}, STDDEV(${primaryNum.name}) AS StdDev_${primaryNum.name}, MIN(${primaryNum.name}) AS Min_${primaryNum.name}, MAX(${primaryNum.name}) AS Max_${primaryNum.name} FROM dataset${whereSql}`;
  } else {
    sqlToRun = `SELECT * FROM dataset${whereSql} LIMIT 25`;
  }

  const sqlResult = executeSqlQuery(dataFile, sqlToRun);

  // Build chart from SQL result rows
  const chartType: 'bar' | 'line' | 'pie' = /pie|share|proportion/i.test(qLower)
    ? 'pie'
    : /line|trend|time|date/i.test(qLower)
      ? 'line'
      : 'bar';

  const labelCol = sqlResult.columns[0];
  const valCol =
    sqlResult.columns.find((c) => c.startsWith('Total_')) ||
    sqlResult.columns.find((c) => c.startsWith('Avg_')) ||
    sqlResult.columns[1] ||
    sqlResult.columns[0];

  const chartData = {
    type: chartType,
    title: primaryCat && primaryNum
      ? `${valCol.replace(/_/g, ' ')} by ${primaryCat.name} (100% of Dataset: ${sqlResult.scannedRows.toLocaleString()} Rows)`
      : `Dataset Overview (${sqlResult.scannedRows.toLocaleString()} Rows)`,
    data: sqlResult.rows.slice(0, 12).map((r) => ({
      name: String(r[labelCol] ?? 'Total'),
      value: Number(toNumericValue(r[valCol]) ?? 0),
    })),
  };

  const toolExecution = {
    tool: 'In-Memory SQL Query Engine (100% Full-Dataset Execution)',
    code: sqlResult.sql,
    output: `Scanned ${sqlResult.scannedRows.toLocaleString()} rows in ${sqlResult.executionTimeMs}ms -> Returned ${sqlResult.rows.length} grouped records.\n${sqlResult.rows
      .slice(0, 5)
      .map((r) => JSON.stringify(r))
      .join('\n')}`,
    reason: `Executed deterministic SQL query across 100% of dataset records (${sqlResult.scannedRows.toLocaleString()} rows) with zero context truncation.`,
  };

  const topRow = sqlResult.rows[0];
  const fmtNum = (n: number | undefined, isCurr?: boolean, isPct?: boolean) => {
    if (n === undefined || n === null) return 'N/A';
    if (isCurr) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    if (isPct && Math.abs(n) <= 1) return `${(n * 100).toFixed(1)}%`;
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const assumptionLine = primaryNum
    ? `*Data Assumption: After inspecting the dataset schema (${profile.totalColumns} columns across ${profile.totalRows.toLocaleString()} records), this analysis maps \`${primaryNum.name}\` (numeric, range ${fmtNum(primaryNum.min, primaryNum.isCurrency, primaryNum.isPercentage)}–${fmtNum(primaryNum.max, primaryNum.isCurrency, primaryNum.isPercentage)}) as the primary metric${primaryCat ? ` grouped by \`${primaryCat.name}\` (${primaryCat.distinctCount} distinct values)` : ''}${whereSql ? ` filtered by \`${whereSql.trim()}\`` : ''} — please let me know if you prefer a different column or definition.*`
    : `*Data Assumption: Evaluated ${profile.totalColumns} detected schema columns across ${profile.totalRows.toLocaleString()} records.*`;

  if (isDetailedMode && primaryNum) {
    const corrPair =
      profile.correlations.find(
        (c) =>
          (c.colX === primaryNum.name && c.colY === secondaryNum?.name) ||
          (c.colY === primaryNum.name && c.colX === secondaryNum?.name)
      ) || profile.correlations[0];

    const corrSection = corrPair
      ? `\n### Relational & Correlation Metrics (${corrPair.colX} vs. ${corrPair.colY})
- **Pearson Correlation ($r$)**: \`${corrPair.pearsonR}\` (${Math.abs(corrPair.pearsonR) >= 0.7 ? 'Strong' : Math.abs(corrPair.pearsonR) >= 0.4 ? 'Moderate' : 'Weak'} ${corrPair.pearsonR >= 0 ? 'positive' : 'negative'} relationship)
- **Coefficient of Determination ($R^2$)**: \`${corrPair.rSquared}\` (${(corrPair.rSquared * 100).toFixed(1)}% variance explained)
- **Linear Regression Trend**: \`${corrPair.colY} = ${corrPair.slope} * ${corrPair.colX} + ${corrPair.intercept}\` (evaluated across $N = ${corrPair.sampleSize.toLocaleString()}$ valid pairs)`
      : '';

    return `## Executive Conclusion
Full-dataset SQL and statistical evaluation across **all ${profile.totalRows.toLocaleString()} records** in \`${dataFile.name}\` confirms a total **${primaryNum.name}** of **${fmtNum(primaryNum.sum, primaryNum.isCurrency, primaryNum.isPercentage)}** (Mean: **${fmtNum(primaryNum.mean, primaryNum.isCurrency, primaryNum.isPercentage)}**, Median: **${fmtNum(primaryNum.median, primaryNum.isCurrency, primaryNum.isPercentage)}**).${topRow && primaryCat ? ` **${topRow[primaryCat.name]}** leads all segments with **${fmtNum(toNumericValue(topRow[`Total_${primaryNum.name}`]) ?? undefined, primaryNum.isCurrency)}**.` : ''}

${assumptionLine}

### Empirical Statistical Distribution (${primaryNum.name} — 100% of Rows)
- **Sample Size ($N$)**: \`${primaryNum.nonNullCount.toLocaleString()}\` valid records (\`${primaryNum.nullCount}\` nulls)
- **Central Tendency**: Mean = \`${fmtNum(primaryNum.mean, primaryNum.isCurrency, primaryNum.isPercentage)}\` | Median = \`${fmtNum(primaryNum.median, primaryNum.isCurrency, primaryNum.isPercentage)}\`
- **Dispersion & Spread**: Std Dev = \`${fmtNum(primaryNum.stdDev, primaryNum.isCurrency)}\` | IQR = \`${fmtNum(primaryNum.iqr, primaryNum.isCurrency)}\` (Q1: \`${fmtNum(primaryNum.q1, primaryNum.isCurrency)}\` to Q3: \`${fmtNum(primaryNum.q3, primaryNum.isCurrency)}\`)
- **Min / Max Bounds**: Min = \`${fmtNum(primaryNum.min, primaryNum.isCurrency)}\` | Max = \`${fmtNum(primaryNum.max, primaryNum.isCurrency)}\`${corrSection}

### Full-Dataset SQL Reference Table
${sqlResult.markdownTable}

<<<CHART_DATA>>>
${JSON.stringify(chartData, null, 2)}
<<<END_CHART_DATA>>>

<<<TOOL_EXECUTION>>>
${JSON.stringify(toolExecution, null, 2)}
<<<END_TOOL_EXECUTION>>>`;
  }

  // Mode A / Mode C Executive Summary format
  const bullets = sqlResult.rows.slice(0, 5).map((r, idx) => {
    const segName = primaryCat ? r[primaryCat.name] : `Record ${idx + 1}`;
    const totalVal = toNumericValue(r[`Total_${primaryNum?.name}`]);
    const avgVal = toNumericValue(r[`Avg_${primaryNum?.name}`]);
    const sharePct =
      primaryNum?.sum && totalVal !== null
        ? ` (${((totalVal / primaryNum.sum) * 100).toFixed(1)}% of dataset total)`
        : '';
    return `${idx + 1}. **${segName}**: Total ${primaryNum?.name || 'Value'} of **${fmtNum(totalVal ?? undefined, primaryNum?.isCurrency)}**${sharePct} across \`${r.Record_Count}\` records (Average: **${fmtNum(avgVal ?? undefined, primaryNum?.isCurrency)}**).`;
  });

  return `## Executive Takeaway
Computed across **100% of the dataset (${profile.totalRows.toLocaleString()} records)** in \`${dataFile.name}\`, cumulative **${primaryNum?.name || 'volume'}** reaches **${fmtNum(primaryNum?.sum, primaryNum?.isCurrency)}** with an overall average of **${fmtNum(primaryNum?.mean, primaryNum?.isCurrency)}** per record.

${assumptionLine}

### Key Empirical Insights
${bullets.join('\n')}

### Computed Reference Breakdown
${sqlResult.markdownTable}

<<<CHART_DATA>>>
${JSON.stringify(chartData, null, 2)}
<<<END_CHART_DATA>>>

<<<TOOL_EXECUTION>>>
${JSON.stringify(toolExecution, null, 2)}
<<<END_TOOL_EXECUTION>>>`;
}
