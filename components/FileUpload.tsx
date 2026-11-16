import React, { useCallback, useState } from 'react';
import type { UniversalDataFile } from '../types';
import { parseUniversalData } from '../utils/dataParser';
import { extractSpreadsheetText } from '../utils/excelExtractor';
import { extractPdfText } from '../utils/pdfExtractor';
import { SAMPLE_DATASETS, SampleDataset } from '../utils/sampleDatasets';
import {
  Upload,
  ClipboardPaste,
  ArrowUpRight,
  FileCheck,
  Layers,
  Database,
} from 'lucide-react';

interface FileUploadProps {
  onDataParsed: (data: UniversalDataFile) => void;
  onError: (message: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataParsed, onError }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [pastedText, setPastedText] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const [isReading, setIsReading] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB hard cap

  const processFile = useCallback(
    async (file: File) => {
      // Option A: Pre-flight file size guardrail before FileReader loads into RAM
      if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        onError(
          `File size (${sizeMb} MB) exceeds the 50MB (~50,000 rows) in-memory limit. Please upload a smaller or filtered dataset.`
        );
        return;
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
      const isExcel = ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'ods';
      const isPdf = ext === 'pdf' || file.type === 'application/pdf';

      setIsReading(true);

      if (isExcel || isPdf) {
        try {
          const buffer = await file.arrayBuffer();
          if (isExcel) {
            const { csvText, activeSheet, totalSheets } = extractSpreadsheetText(buffer);
            const parsed = parseUniversalData(file.name, csvText, file.size);
            if (totalSheets > 1) {
              parsed.formatLabel = `Excel (${ext?.toUpperCase()} · Sheet: ${activeSheet})`;
            }
            onDataParsed(parsed);
          } else {
            const { text, pageCount } = await extractPdfText(buffer);
            const parsed = parseUniversalData(file.name, text, file.size);
            parsed.formatLabel = `PDF Document (${pageCount} ${pageCount === 1 ? 'page' : 'pages'})`;
            onDataParsed(parsed);
          }
        } catch (err: any) {
          onError(`Failed to parse ${isPdf ? 'PDF' : 'Excel'} file: ${err?.message || 'Unknown error'}`);
        } finally {
          setIsReading(false);
        }
        return;
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        setIsReading(false);
        const text = e.target?.result as string;
        if (!text || text.trim().length === 0) {
          onError('The selected file appears to be empty.');
          return;
        }

        try {
          const parsed = parseUniversalData(file.name, text, file.size);
          onDataParsed(parsed);
        } catch (err: any) {
          onError(`Failed to read file: ${err?.message || 'Unknown error'}`);
        }
      };

      reader.onerror = () => {
        setIsReading(false);
        onError('Failed to read the file.');
      };

      reader.readAsText(file);
    },
    [onDataParsed, onError, MAX_FILE_SIZE_BYTES]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) {
      onError('Please paste some data or text to analyze.');
      return;
    }
    const fileName = pastedTitle.trim() || 'pasted_dataset.txt';
    const parsed = parseUniversalData(fileName, pastedText);
    onDataParsed(parsed);
  };

  const handleLoadSample = (sample: SampleDataset) => {
    const parsed = parseUniversalData(sample.fileName, sample.content);
    onDataParsed(parsed);
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-2">
      {/* Mode Selector Segmented Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex p-1 rounded-xl bg-slate-200/60 border border-slate-300/40 backdrop-blur-sm">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'upload'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upload File
          </button>
          <button
            onClick={() => setActiveTab('paste')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'paste'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Paste Raw Content
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>CSV</span>
          <span>·</span>
          <span>XLSX</span>
          <span>·</span>
          <span>PDF</span>
          <span>·</span>
          <span>JSON</span>
          <span>·</span>
          <span>LOGS</span>
          <span>·</span>
          <span>TEXT</span>
        </div>
      </div>

      {/* Main Upload Box */}
      {activeTab === 'upload' ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative group rounded-2xl transition-all duration-200 p-10 sm:p-12 text-center cursor-pointer glass-surface shadow-xs ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 scale-[1.008] ring-4 ring-blue-500/10'
              : 'border border-slate-200/90 hover:border-blue-400/80 hover:shadow-md'
          }`}
        >
          {/* Subtle artistic corner reticles */}
          <div className="absolute top-3 left-3 w-2.5 h-2.5 border-t border-l border-slate-300 pointer-events-none group-hover:border-blue-400 transition-colors" />
          <div className="absolute top-3 right-3 w-2.5 h-2.5 border-t border-r border-slate-300 pointer-events-none group-hover:border-blue-400 transition-colors" />
          <div className="absolute bottom-3 left-3 w-2.5 h-2.5 border-b border-l border-slate-300 pointer-events-none group-hover:border-blue-400 transition-colors" />
          <div className="absolute bottom-3 right-3 w-2.5 h-2.5 border-b border-r border-slate-300 pointer-events-none group-hover:border-blue-400 transition-colors" />

          <label htmlFor="file-upload" className="w-full h-full flex flex-col items-center cursor-pointer">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100 border border-slate-200/80 text-blue-600 flex items-center justify-center mb-4 shadow-xs group-hover:scale-105 group-hover:border-blue-300 transition-all">
              <Upload className={`w-6 h-6 stroke-[1.75] ${isReading ? 'animate-pulse' : ''}`} />
            </div>

            <p className="text-base sm:text-lg font-semibold text-slate-900 tracking-tight">
              {isReading ? (
                <span className="text-blue-600">Extracting &amp; indexing file...</span>
              ) : (
                <>
                  <span className="text-blue-600 underline decoration-blue-200 underline-offset-4 hover:decoration-blue-500">
                    Choose a file
                  </span>{' '}
                  or drag &amp; drop here
                </>
              )}
            </p>

            <p className="mt-1.5 text-xs text-slate-500 max-w-sm">
              Accepts CSV, Excel (.xlsx/.xls), PDF, JSON, logs, or freeform text
            </p>
            <p className="mt-1 text-[11px] font-mono text-slate-400">
              (File size limit: 50MB / ~50,000 rows)
            </p>

            <input
              id="file-upload"
              name="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileChange}
              disabled={isReading}
            />
          </label>
        </div>
      ) : (
        <div className="glass-surface p-6 sm:p-7 rounded-2xl shadow-xs space-y-4 border border-slate-200/90">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Title or Descriptor (Optional)
            </label>
            <input
              type="text"
              value={pastedTitle}
              onChange={(e) => setPastedTitle(e.target.value)}
              placeholder="e.g. system_logs.log or Q3_metrics.csv"
              className="w-full px-3.5 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all placeholder-slate-400 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Raw Data / Text Content
            </label>
            <textarea
              rows={8}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste any CSV, JSON, logs, documentation, or transcript text here..."
              className="w-full p-3.5 font-mono text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none transition-all leading-relaxed placeholder-slate-400"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handlePasteSubmit}
              disabled={!pastedText.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium text-xs rounded-xl transition-all shadow-xs"
            >
              <FileCheck className="w-3.5 h-3.5" />
              Analyze Content
            </button>
          </div>
        </div>
      )}

      {/* Preset Quick-Load Samples */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Sample Datasets</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">Instant test</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SAMPLE_DATASETS.map((sample) => (
            <div
              key={sample.id}
              onClick={() => handleLoadSample(sample)}
              className="group p-4 glass-surface-subtle hover:bg-white border border-slate-200/70 hover:border-blue-300 rounded-xl cursor-pointer transition-all hover:shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-900 text-xs sm:text-sm group-hover:text-blue-600 transition-colors">
                    {sample.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {sample.type.split(' ')[0]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {sample.description}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-blue-600">
                <span className="font-mono text-[11px] text-slate-400 group-hover:text-blue-600 transition-colors">
                  {sample.fileName}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;