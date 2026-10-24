import React, { useState, useMemo } from 'react';
import type { UniversalDataFile, FileAnalysisSummary } from '../types';
import { formatBytes } from '../utils/dataParser';
import SummaryCard from './SummaryCard';
import {
  Table as TableIcon,
  FileText,
  Code,
  Search,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  BarChart3,
} from 'lucide-react';

interface DataTableProps {
  data: UniversalDataFile;
  summary?: FileAnalysisSummary | null;
  onSelectQuestion?: (question: string) => void;
}

const DataTable: React.FC<DataTableProps> = ({ data, summary, onSelectQuestion }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'structured' | 'raw' | 'json'>(() => {
    if (summary) return 'summary';
    if (data.tabular) return 'structured';
    if (data.parsedJson) return 'json';
    return 'raw';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredTabularRows = useMemo(() => {
    if (!data.tabular) return [];
    if (!searchQuery.trim()) return data.tabular.rows.slice(0, 100);

    const q = searchQuery.toLowerCase();
    return data.tabular.rows
      .filter((row) =>
        row.some((cell) => String(cell || '').toLowerCase().includes(q))
      )
      .slice(0, 100);
  }, [data.tabular, searchQuery]);

  const rawLines = useMemo(() => {
    return data.rawText.split(/\r\n|\n/);
  }, [data.rawText]);

  const filteredRawLines = useMemo(() => {
    if (!searchQuery.trim()) return rawLines.slice(0, 300);
    const q = searchQuery.toLowerCase();
    return rawLines
      .map((line, idx) => ({ line, originalIdx: idx + 1 }))
      .filter(({ line }) => line.toLowerCase().includes(q))
      .slice(0, 300);
  }, [rawLines, searchQuery]);

  return (
    <div
      className={`glass-surface rounded-2xl shadow-xs flex flex-col transition-all overflow-hidden border border-slate-200/90 ${
        expanded ? 'fixed inset-4 z-50 shadow-2xl bg-white' : 'h-full min-h-[540px]'
      }`}
    >
      {/* Top Header & Metadata */}
      <div className="px-5 py-3.5 border-b border-slate-200/70 bg-white/60">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate font-mono">
              {data.name}
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
              <span>{data.formatLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatBytes(data.size)}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{data.lineCount} lines</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{data.wordCount} words</span>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleCopy}
              title="Copy raw content"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Collapse preview' : 'Expand preview'}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {expanded ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* View Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1.5">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/60 text-xs flex-wrap gap-0.5">
            {summary && (
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-3 py-1 rounded-md flex items-center gap-1.5 text-[11px] font-semibold transition-all ${
                  activeTab === 'summary'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3 h-3 text-blue-600" />
                Executive Stats
              </button>
            )}

            {data.tabular && (
              <button
                onClick={() => setActiveTab('structured')}
                className={`px-3 py-1 rounded-md flex items-center gap-1.5 text-[11px] font-semibold transition-all ${
                  activeTab === 'structured'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3 h-3" />
                Table ({data.tabular.totalRows})
              </button>
            )}

            {data.parsedJson && (
              <button
                onClick={() => setActiveTab('json')}
                className={`px-3 py-1 rounded-md flex items-center gap-1.5 text-[11px] font-semibold transition-all ${
                  activeTab === 'json'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code className="w-3 h-3" />
                JSON
              </button>
            )}

            <button
              onClick={() => setActiveTab('raw')}
              className={`px-3 py-1 rounded-md flex items-center gap-1.5 text-[11px] font-semibold transition-all ${
                activeTab === 'raw'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3 h-3" />
              Raw
            </button>
          </div>

          {activeTab !== 'summary' && (
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter contents..."
                className="pl-7 pr-3 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none w-full sm:w-44 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-white/70">
        {/* 0. Executive Summary & Stats Card */}
        {activeTab === 'summary' && summary && (
          <div className="p-4 sm:p-5">
            <SummaryCard
              summary={summary}
              fileName={data.name}
              onSelectQuestion={onSelectQuestion || (() => {})}
            />
          </div>
        )}

        {/* 1. Tabular Grid View */}
        {activeTab === 'structured' && data.tabular && (
          <div className="relative">
            <table className="w-full text-xs text-left text-slate-700 border-collapse">
              <thead className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/90 sticky top-0 z-10 border-b border-slate-200 font-mono">
                <tr>
                  <th className="px-3 py-2 w-10 text-slate-400 text-center font-normal">#</th>
                  {data.tabular.headers.map((header, idx) => (
                    <th key={idx} scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                      {header || `Col ${idx + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredTabularRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-3 py-2 text-center text-slate-400 text-[10px] tabular-nums select-none">
                      {rIdx + 1}
                    </td>
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-3 py-2 whitespace-nowrap max-w-xs truncate text-slate-800 tabular-nums"
                        title={String(cell ?? '')}
                      >
                        {String(cell ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.tabular.rows.length > 100 && (
              <div className="p-3 text-center text-[11px] text-slate-400 bg-slate-50/60 border-t border-slate-100 font-mono">
                Displaying first 100 of {data.tabular.rows.length} rows.
              </div>
            )}
          </div>
        )}

        {/* 2. JSON Formatted View */}
        {activeTab === 'json' && data.parsedJson && (
          <div className="p-4">
            <pre className="text-xs font-mono text-slate-800 bg-slate-50/80 p-4 rounded-xl overflow-x-auto border border-slate-200/70 leading-relaxed whitespace-pre-wrap">
              {JSON.stringify(data.parsedJson, null, 2)}
            </pre>
          </div>
        )}

        {/* 3. Raw Content / Unstructured Document View */}
        {activeTab === 'raw' && (
          <div className="font-mono text-xs leading-relaxed">
            {searchQuery.trim() ? (
              <div className="divide-y divide-slate-100">
                {(filteredRawLines as { line: string; originalIdx: number }[]).map(
                  ({ line, originalIdx }) => (
                    <div
                      key={originalIdx}
                      className="flex items-start px-3 py-1 hover:bg-slate-50"
                    >
                      <span className="w-10 text-slate-400 select-none text-right pr-3 flex-shrink-0 text-[10px] tabular-nums">
                        {originalIdx}
                      </span>
                      <span className="flex-1 whitespace-pre-wrap text-slate-800 break-words">
                        {line}
                      </span>
                    </div>
                  )
                )}
                {filteredRawLines.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No lines matched "{searchQuery}"
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {rawLines.slice(0, 500).map((line, idx) => (
                  <div
                    key={idx}
                    className="flex items-start px-3 py-0.5 hover:bg-slate-100/50"
                  >
                    <span className="w-10 text-slate-400 select-none text-right pr-3 flex-shrink-0 text-[10px] tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap text-slate-800 break-words text-[11px]">
                      {line}
                    </span>
                  </div>
                ))}
                {rawLines.length > 500 && (
                  <div className="p-3 text-center text-[11px] text-slate-400 bg-slate-50/60 border-t border-slate-100 font-mono">
                    Showing first 500 of {rawLines.length} lines.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataTable;