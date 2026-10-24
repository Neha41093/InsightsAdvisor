import React, { useState } from 'react';
import type { LearnedPattern, FileAnalysisSummary, UniversalDataFile } from '../types';
import {
  BookOpen,
  ThumbsUp,
  Play,
  Trash2,
  X,
  Code,
  Sparkles,
  Search,
  MessageSquare,
  HelpCircle,
} from 'lucide-react';

interface PlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
  patterns: LearnedPattern[];
  activeSummary?: FileAnalysisSummary | null;
  activeDataFile?: UniversalDataFile | null;
  onRunQuestion: (question: string) => void;
  onDeletePattern: (id: string) => void;
  onClearAll: () => void;
}

const PlaybookModal: React.FC<PlaybookModalProps> = ({
  isOpen,
  onClose,
  patterns,
  activeSummary,
  activeDataFile,
  onRunQuestion,
  onDeletePattern,
  onClearAll,
}) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'learned' | 'queries'>('learned');

  if (!isOpen) return null;

  const filteredPatterns = patterns.filter(
    (p) =>
      p.question.toLowerCase().includes(search.toLowerCase()) ||
      p.answerSummary.toLowerCase().includes(search.toLowerCase()) ||
      (p.toolUsed && p.toolUsed.toLowerCase().includes(search.toLowerCase()))
  );

  // Dynamic analytical queries tailored directly to the uploaded dataset
  const dynamicInquiries = activeSummary?.questionCategories || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/90 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-none">
                Advisor Playbook & Memory
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Learned preferences and analytical patterns adapting to your data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch & Search */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/60 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('learned')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'learned'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
              Learned from Feedback ({patterns.length})
            </button>
            <button
              onClick={() => setActiveTab('queries')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'queries'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              {activeDataFile ? 'Inquiries for Current Data' : 'Analytical Inquiries'}
            </button>
          </div>

          {activeTab === 'learned' && patterns.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search learned queries..."
                className="pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900/10 w-full sm:w-48 font-mono"
              />
            </div>
          )}
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {activeTab === 'learned' ? (
            patterns.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/80 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <ThumbsUp className="w-5 h-5 stroke-[1.5]" />
                </div>
                <h3 className="text-sm font-semibold text-slate-800">
                  No learned patterns yet
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                  When you rate an answer with <strong className="text-slate-700">Thumbs Up (👍)</strong>, the advisor stores your preferred analytical depth, calculation tools, and formatting style to tailor all future responses to your needs.
                </p>
              </div>
            ) : filteredPatterns.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 font-mono">
                No learned patterns matched "{search}"
              </div>
            ) : (
              filteredPatterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 transition-all shadow-2xs group"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded bg-emerald-50 text-emerald-700">
                        <ThumbsUp className="w-3 h-3" />
                      </span>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 leading-snug">
                        {pattern.question}
                      </h4>
                    </div>
                    {pattern.toolUsed && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600 border border-slate-200/60 flex-shrink-0">
                        <Code className="w-3 h-3" />
                        {pattern.toolUsed}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed ml-6 pl-1">
                    {pattern.answerSummary}
                  </p>

                  {pattern.userNote && (
                    <div className="mt-2 ml-6 pl-1 text-[11px] text-blue-700 bg-blue-50/60 px-2.5 py-1 rounded-md border border-blue-100 inline-block font-mono">
                      Note: {pattern.userNote}
                    </div>
                  )}

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between ml-6 pl-1">
                    <span className="text-[10px] font-mono text-slate-400">
                      Saved {new Date(pattern.timestamp).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onDeletePattern(pattern.id)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                        title="Remove from memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          onRunQuestion(pattern.question);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Run Query
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : (
            // Dynamic Inquiries tailored to the active dataset
            dynamicInquiries.length > 0 ? (
              <div className="space-y-4">
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed">
                  These inquiries are dynamically generated for <strong className="font-semibold">{activeDataFile?.name || 'your dataset'}</strong> based on its detected schema, fields, and metrics.
                </div>
                {dynamicInquiries.map((category, cIdx) => (
                  <div key={cIdx} className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {category.category}
                    </h4>
                    <div className="space-y-1.5">
                      {category.questions.map((q, qIdx) => (
                        <div
                          key={qIdx}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 bg-white hover:border-blue-300 transition-all shadow-2xs"
                        >
                          <span className="text-xs text-slate-800 font-medium pr-3">
                            {q}
                          </span>
                          <button
                            onClick={() => {
                              onRunQuestion(q);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs flex-shrink-0"
                          >
                            <MessageSquare className="w-3 h-3" />
                            Ask
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <HelpCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h4 className="text-xs font-semibold text-slate-700">
                  Upload a dataset to see tailored inquiries
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  When you upload any file, the advisor dynamically derives custom questions based on its exact fields.
                </p>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        {activeTab === 'learned' && patterns.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-mono text-[11px]">
              {patterns.length} learned preference{patterns.length === 1 ? '' : 's'} active in advisor prompt
            </span>
            <button
              onClick={onClearAll}
              className="text-red-600 hover:text-red-700 text-xs font-semibold transition-colors"
            >
              Clear Memory
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaybookModal;
