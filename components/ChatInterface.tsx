import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, UniversalDataFile, FileAnalysisSummary, AnalysisDepth } from '../types';
import ChartComponent from './ChartComponent';
import { cleanEmptySections } from '../utils/markdownCleaner';
import {
  Send,
  ThumbsUp,
  ThumbsDown,
  Code2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  Check,
  Compass,
  ArrowRight,
} from 'lucide-react';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  dataFile?: UniversalDataFile | null;
  summary?: FileAnalysisSummary | null;
  depth?: AnalysisDepth;
  onDepthChange?: (depth: AnalysisDepth) => void;
  onSendMessage: (message: string, depth?: AnalysisDepth) => void;
  onFeedback: (messageId: string, rating: 'up' | 'down', comment?: string) => void;
  onRefineMessage?: (message: ChatMessage) => void;
  isLoading: boolean;
}

function renderMarkdown(text: string) {
  if (!text) return '';

  // 1. Sanitize text: remove empty headers, headers with only placeholders ("None", "N/A"),
  // and headers whose chart or tool blocks are extracted into dedicated UI cards.
  const sanitized = cleanEmptySections(text);
  if (!sanitized) return '';

  const escaped = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  let formatted = escaped.replace(
    /```([\s\S]*?)```/g,
    '<pre class="bg-slate-900 text-slate-100 p-3 rounded-xl my-2.5 overflow-x-auto font-mono text-xs leading-relaxed border border-slate-800"><code>$1</code></pre>'
  );

  // Inline code
  formatted = formatted.replace(
    /`([^`]+)`/g,
    '<code class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono text-xs border border-slate-200/60">$1</code>'
  );

  // Bold
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');

  // Italics
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-700">$1</em>');

  // Headers
  formatted = formatted.replace(/^### (.*$)/gim, '<h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider mt-3 mb-1">$1</h4>');
  formatted = formatted.replace(/^## (.*$)/gim, '<h3 class="text-sm font-bold text-slate-900 mt-3 mb-1.5">$1</h3>');
  formatted = formatted.replace(/^# (.*$)/gim, '<h2 class="text-base font-bold text-slate-900 mt-4 mb-2">$1</h2>');

  // Bullet items
  formatted = formatted.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-slate-700 my-0.5 text-xs sm:text-sm">$1</li>');

  // Numbered list
  formatted = formatted.replace(/^\s*\d+\.\s+(.*$)/gim, '<li class="ml-4 list-decimal text-slate-700 my-0.5 text-xs sm:text-sm">$1</li>');

  // Tables
  const tableRegex = /((?:^[ \t]*\|.+?\|[ \t]*\r?\n)+)/gm;
  formatted = formatted.replace(tableRegex, (match) => {
    const lines = match.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return match;

    const isSeparator = /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[1]);
    if (!isSeparator) return match;

    const parseRow = (line: string) => {
      const inner = line.replace(/^\|/, '').replace(/\|$/, '');
      return inner.split('|').map((c) => c.trim());
    };

    const headers = parseRow(lines[0]);
    const bodyRows = lines.slice(2).map(parseRow);

    const thead = `<thead class="bg-slate-100 text-[10px] uppercase font-semibold text-slate-600 border-b border-slate-200"><tr>${headers
      .map((h) => `<th class="px-3 py-1.5 text-left font-sans">${h}</th>`)
      .join('')}</tr></thead>`;

    const tbody = `<tbody class="divide-y divide-slate-100 text-xs font-mono">${bodyRows
      .map(
        (row) =>
          `<tr class="hover:bg-slate-50/80 transition-colors">${row
            .map((cell) => `<td class="px-3 py-1.5 text-slate-800">${cell}</td>`)
            .join('')}</tr>`
      )
      .join('')}</tbody>`;

    return `<div class="my-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs"><table class="w-full text-left border-collapse">${thead}${tbody}</table></div>`;
  });

  // Paragraph breaks
  formatted = formatted.replace(/\n\n/g, '<br/><br/>');
  formatted = formatted.replace(/\n/g, '<br/>');

  // Safety pass: remove any header directly followed by another header or end of output without body
  formatted = formatted.replace(/<h([2-4])[^>]*>.*?<\/h\1>(?:\s*<br\s*\/?>)*(?=<h[2-4]|$)/gi, '');
  formatted = formatted.replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br/><br/>').trim();

  return formatted;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  dataFile,
  summary,
  depth = 'auto',
  onDepthChange,
  onSendMessage,
  onFeedback,
  onRefineMessage,
  isLoading,
}) => {
  const [input, setInput] = useState('');
  const [openToolForId, setOpenToolForId] = useState<string | null>(null);
  const [feedbackNoteForId, setFeedbackNoteForId] = useState<string | null>(null);
  const [feedbackNoteText, setFeedbackNoteText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleSaveNote = (messageId: string) => {
    onFeedback(messageId, 'up', feedbackNoteText.trim());
    setFeedbackNoteForId(null);
    setFeedbackNoteText('');
  };

  const toggleTool = (id: string) => {
    setOpenToolForId(openToolForId === id ? null : id);
  };

  // 100% Dynamic suggested questions with varied intent (summary vs detailed statistical vs targeted)
  const getDynamicSuggestions = (): string[] => {
    const suggestionsList: string[] = [];

    // Always offer the executive summary / top 5 insights option
    suggestionsList.push('What are the top 5 insights across this dataset?');

    // Tabular header specific questions (both summary and deep statistical)
    if (dataFile?.tabular?.headers && dataFile.tabular.headers.length > 0) {
      const validHeaders = dataFile.tabular.headers.filter(
        (h) => h && !h.toLowerCase().startsWith('col ') && !h.toLowerCase().startsWith('column ')
      );
      if (validHeaders.length >= 2) {
        suggestionsList.push(`Detailed correlation analysis between ${validHeaders[0]} and ${validHeaders[1]}`);
        suggestionsList.push(`Calculate distribution & IQR statistics for ${validHeaders[0]}`);
        suggestionsList.push('Identify statistical anomalies or outliers in this data');
      } else if (validHeaders.length === 1) {
        suggestionsList.push(`Detailed distribution analysis of ${validHeaders[0]}`);
        suggestionsList.push(`Identify statistical anomalies in ${validHeaders[0]}`);
      }
    } else if (dataFile?.format === 'log') {
      suggestionsList.push('Give me a brief summary of error frequencies');
      suggestionsList.push('Detailed analysis of root causes and timeline of spikes');
    } else {
      suggestionsList.push('Give me a brief executive summary of key findings');
      suggestionsList.push('Provide a detailed statistical and distribution breakdown');
    }

    // Add any domain-specific AI generated questions if available
    if (summary?.questionCategories && summary.questionCategories.length > 0) {
      for (const cat of summary.questionCategories) {
        for (const q of cat.questions) {
          if (!suggestionsList.includes(q)) suggestionsList.push(q);
        }
      }
    }

    return suggestionsList.slice(0, 5);
  };

  const suggestions = getDynamicSuggestions();

  return (
    <div className="glass-surface rounded-2xl shadow-xs h-full flex flex-col min-h-[540px] overflow-hidden border border-slate-200/90">
      {/* Top Bar with Adaptive Depth Controls */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200/70 bg-white/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200/80 text-slate-800 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-semibold text-slate-900 leading-none">
              Inquiry & Analysis
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {summary?.domain ? `${summary.domain} · ` : ''}Adaptive Analytical Depth
            </p>
          </div>
        </div>

        {/* Analytical Depth Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/80 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => onDepthChange?.('auto')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              depth === 'auto'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Auto-Detect: Adapts dynamically based on your question (brief for summaries, deep for statistical inquiries)"
          >
            ✨ Auto
          </button>
          <button
            type="button"
            onClick={() => onDepthChange?.('summary')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              depth === 'summary'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Executive Summary: Concise natural-language takeaways & key numbers without dense formulas"
          >
            📝 Summary
          </button>
          <button
            type="button"
            onClick={() => onDepthChange?.('detailed')}
            className={`px-2 py-0.5 rounded-md transition-all ${
              depth === 'detailed'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Deep Statistical: Full statistical distributions, IQR, correlations, and reference data table"
          >
            🔬 Deep Stats
          </button>
        </div>
      </div>

      {/* Messages viewport */}
      <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
        {messages.map((message) => {
          const isBot = message.sender === 'bot';
          const isToolOpen = openToolForId === message.id;
          const isNoteOpen = feedbackNoteForId === message.id;

          return (
            <div
              key={message.id}
              className={`flex items-start gap-3 ${isBot ? '' : 'justify-end'}`}
            >
              {isBot && (
                <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-mono font-bold shadow-xs">
                  AI
                </div>
              )}

              <div
                className={`rounded-2xl p-4 transition-all text-xs sm:text-sm leading-relaxed ${
                  isBot
                    ? `${
                        message.chart ? 'w-full max-w-full' : 'max-w-2xl'
                      } bg-white/95 text-slate-800 border border-slate-200/80 shadow-2xs`
                    : 'max-w-xl bg-slate-900 text-white shadow-xs'
                }`}
              >
                {message.isLoading ? (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce"></div>
                    <span className="text-xs text-slate-400 font-mono ml-1.5">
                      Executing calculation...
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Tool Execution Accordion Badge */}
                    {message.toolExecution && (
                      <div className="mb-3">
                        <button
                          onClick={() => toggleTool(message.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-[11px] font-mono font-medium text-slate-700 border border-slate-200/70 transition-colors"
                        >
                          <Code2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Method: {message.toolExecution.tool}</span>
                          {isToolOpen ? (
                            <ChevronUp className="w-3 h-3 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-slate-400" />
                          )}
                        </button>

                        {isToolOpen && (
                          <div className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-100 text-xs font-mono border border-slate-800 animate-in fade-in duration-100">
                            {message.toolExecution.reason && (
                              <div className="text-[11px] text-slate-400 mb-2">
                                # Objective: {message.toolExecution.reason}
                              </div>
                            )}
                            <div className="text-emerald-400 text-[11px] mb-1">
                              // Executed Query / Script:
                            </div>
                            <pre className="overflow-x-auto p-2 bg-slate-950/80 rounded-lg text-slate-200 leading-relaxed text-[11px] mb-2">
                              <code>{message.toolExecution.code}</code>
                            </pre>
                            {message.toolExecution.output && (
                              <div className="text-[11px] text-slate-300 pt-1 border-t border-slate-800">
                                <span className="text-slate-500">Computed Output: </span>
                                <span className="text-blue-300 font-semibold">
                                  {message.toolExecution.output}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Message Body */}
                    {message.text && (
                      <div
                        className="break-words"
                        dangerouslySetInnerHTML={{
                          __html: isBot
                            ? renderMarkdown(message.text)
                            : message.text.replace(/\n/g, '<br/>'),
                        }}
                      />
                    )}

                    {/* Chart Visualization with dynamic chatbot width */}
                    {message.chart && (
                      <div className="mt-3.5 w-full min-w-0">
                        <ChartComponent data={message.chart} />
                      </div>
                    )}

                    {/* Feedback Rating Module for Bot Messages */}
                    {isBot && message.id !== 'initial-bot-message' && (
                      <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 font-medium">
                            Was this answer useful?
                          </span>
                          <button
                            onClick={() => {
                              onFeedback(message.id, 'up');
                              setFeedbackNoteForId(message.id);
                            }}
                            className={`p-1 rounded-md transition-colors ${
                              message.feedback?.rating === 'up'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                            title="Helpful (Learn for future questions)"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onFeedback(message.id, 'down')}
                            className={`p-1 rounded-md transition-colors ${
                              message.feedback?.rating === 'down'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            }`}
                            title="Unhelpful"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Status / Refine controls */}
                        <div className="flex items-center gap-2">
                          {message.feedback?.rating === 'up' && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium font-mono">
                              <Check className="w-3 h-3" />
                              Saved to Playbook
                            </span>
                          )}

                          {message.feedback?.rating === 'down' && onRefineMessage && (
                            <button
                              onClick={() => onRefineMessage(message)}
                              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Refine & Recalculate
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Optional Note on Thumbs Up */}
                    {isNoteOpen && (
                      <div className="mt-2 p-2.5 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center gap-2">
                        <input
                          type="text"
                          value={feedbackNoteText}
                          onChange={(e) => setFeedbackNoteText(e.target.value)}
                          placeholder="Add preference note (e.g. 'Love the SQL breakdown' or 'Prefers specific chart')..."
                          className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-2.5 py-1 focus:outline-none font-mono"
                        />
                        <button
                          onClick={() => handleSaveNote(message.id)}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setFeedbackNoteForId(null)}
                          className="text-slate-400 hover:text-slate-600 text-xs px-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Dynamic Drill-down options to dive deeper into the data */}
                    {isBot && message.id !== 'initial-bot-message' && !message.isLoading && (
                      <div className="mt-3.5 pt-2.5 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                          <Compass className="w-3 h-3 text-blue-500" />
                          <span>Drill Down / Request Details</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {(message.suggestedFollowUps && message.suggestedFollowUps.length > 0
                            ? message.suggestedFollowUps
                            : [
                                'Detailed statistical & correlation breakdown',
                                'Show distribution & IQR quartiles',
                                'Identify key anomalies & outliers',
                                'Show structured reference table',
                              ]
                          ).map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onSendMessage(item)}
                              disabled={isLoading}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 hover:border-blue-200 transition-colors font-medium shadow-2xs group disabled:opacity-50 text-left"
                            >
                              <span>{item}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-500 transition-transform group-hover:translate-x-0.5 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {!isBot && (
                <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-mono font-medium">
                  U
                </div>
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts strip - 100% dynamic */}
      {suggestions.length > 0 && !isLoading && (
        <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-200/60">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            <Compass className="w-3 h-3 text-slate-400" />
            <span>Recommended Inquiries for this data</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((prompt, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(prompt)}
                className="text-xs text-left bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 px-2.5 py-1 rounded-lg border border-slate-200/80 transition-colors shadow-2xs truncate max-w-full"
                title={prompt}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="p-3 sm:p-4 border-t border-slate-200/80 bg-white/80 backdrop-blur-sm">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              dataFile
                ? `Query ${dataFile.name}...`
                : 'Ask a question about your data...'
            }
            disabled={isLoading}
            className="flex-1 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 focus:outline-none transition-all"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-slate-900 hover:bg-slate-800 text-white p-2.5 sm:px-4 sm:py-2.5 rounded-xl disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-xs flex items-center justify-center flex-shrink-0"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;