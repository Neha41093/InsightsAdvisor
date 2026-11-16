import * as XLSX from 'xlsx';

export interface SpreadsheetExtractionResult {
  csvText: string;
  sheetNames: string[];
  activeSheet: string;
  totalSheets: number;
}

/**
 * Extracts structured CSV text from an Excel workbook (.xlsx, .xls, .xlsm, .ods).
 * Automatically selects the primary data sheet when workbooks contain cover tabs or multiple sheets.
 */
export function extractSpreadsheetText(buffer: ArrayBuffer | Uint8Array): SpreadsheetExtractionResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded Excel workbook contains no sheets.');
  }

  let bestSheetName = '';
  let bestCsv = '';
  let bestScore = -1;

  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const name = workbook.SheetNames[i];
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;

    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (!csv) continue;

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const rowCount = Math.max(0, range.e.r - range.s.r + 1);
    const colCount = Math.max(0, range.e.c - range.s.c + 1);
    const cellScore = rowCount * colCount;

    // Prefer the first sheet if it has substantial tabular data (>= 2 rows & >= 2 cols)
    if (i === 0 && rowCount >= 2 && colCount >= 2) {
      bestSheetName = name;
      bestCsv = csv;
      break;
    }

    if (cellScore > bestScore) {
      bestScore = cellScore;
      bestSheetName = name;
      bestCsv = csv;
    }
  }

  if (!bestCsv) {
    throw new Error('The uploaded Excel workbook contains no readable tabular data.');
  }

  return {
    csvText: bestCsv,
    sheetNames: workbook.SheetNames,
    activeSheet: bestSheetName,
    totalSheets: workbook.SheetNames.length,
  };
}
