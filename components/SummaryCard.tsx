import React from 'react';
import type { FileAnalysisSummary } from '../types';
import {
  TrendingUp,
  HelpCircle,
  Activity,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface SummaryCardProps {
  summary: FileAnalysisSummary;
  fileName: string;
  onSelectQuestion: (question: string) => void;
  isLoading?: boolean;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  summary,
  fileName,
  onSelectQuestion,
  isLoading,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6 space-y-5">
      {/* Executive Snapshot */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-700 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider">
              Executive Data Snapshot
            </h3>
          </div>
          {summary.domain && (
            <span className="text-[11px] font-mono text-slate-500">
              {summary.domain}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
          {summary.executiveSummary}
        </p>
      </div>

      {/* Quantitative Key Metrics Grid - 100% data dependent */}
      {summary.metrics && summary.metrics.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <TrendingUp className="w-3 h-3 text-emerald-600" />
            <span>Key Metrics & Derived Statistics</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {summary.metrics.map((metric, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 flex flex-col justify-between"
              >
                <span className="text-[11px] text-slate-500 font-medium truncate">
                  {metric.label}
                </span>
                <span className="text-sm sm:text-base font-bold text-slate-900 font-mono tabular-nums my-1">
                  {metric.value}
                </span>
                {metric.note && (
                  <span className="text-[10px] text-slate-400 truncate">
                    {metric.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Health & Integrity Bar */}
      {summary.dataHealth && (
        <div className="px-3.5 py-2 rounded-xl bg-slate-100/60 border border-slate-200/60 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-semibold text-slate-800">Health:</span>
            <span>{summary.dataHealth.quality}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>Density: {summary.dataHealth.density}</span>
            <span>·</span>
            <span>{summary.dataHealth.records}</span>
          </div>
        </div>
      )}

      {/* Suggested Questions Options - dynamically derived */}
      {summary.questionCategories && summary.questionCategories.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <HelpCircle className="w-3 h-3 text-blue-600" />
            <span>Recommended Questions for this Data</span>
          </div>

          <div className="space-y-3">
            {summary.questionCategories.map((cat, cIdx) => (
              <div key={cIdx} className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500 block">
                  {cat.category}
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {cat.questions.map((q, qIdx) => (
                    <button
                      key={qIdx}
                      onClick={() => onSelectQuestion(q)}
                      disabled={isLoading}
                      className="group flex items-center justify-between text-left p-2.5 bg-white hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-300 rounded-xl transition-all shadow-2xs cursor-pointer"
                    >
                      <span className="text-xs text-slate-800 group-hover:text-blue-700 font-medium pr-2">
                        {q}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SummaryCard;
